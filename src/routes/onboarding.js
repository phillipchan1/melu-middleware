const express = require('express');
const { createJsonCompletion, isAzureConfigured } = require('../services/azureOpenAI');
const { buildParseFreeTextPrompt } = require('../prompts/parseFreeText');
const { buildGenerateChefCardComparisonsPrompt } = require('../prompts/generateChefCard');
const { TAGLINE_SYSTEM_PROMPT, buildTaglineUserJson } = require('../prompts/chefTagline');
const {
  scoreFromStructured,
  applyLLMParse,
  getTopTwoDimensions,
  getBuildName,
  computeOverallScore,
} = require('../services/onboardingScoring');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const {
  normalizeOnboardingAnswers,
  staplesListToDescription,
  getStaplesList,
  getAspirationsList,
  aspirationsListToDescription,
} = require('../lib/normalizeOnboardingAnswers');
const { replaceUserStaples } = require('../lib/staplesDb');
const { replaceOnboardingUserMeals } = require('../lib/userMealsDb');

const router = express.Router();

function parseDiscoveryPace(answers) {
  if (answers.discoveryPace != null && Number.isFinite(Number(answers.discoveryPace))) {
    return Math.min(5, Math.max(1, Math.round(Number(answers.discoveryPace))));
  }
  const q9 = answers.q9 != null ? parseInt(String(answers.q9), 10) : NaN;
  if (Number.isFinite(q9)) return Math.min(5, Math.max(1, q9));
  return 3;
}

function topRotationCuisines(staples) {
  const seen = new Set();
  const out = [];
  for (const m of staples) {
    if (!m || !m.cuisine) continue;
    if (seen.has(m.cuisine)) continue;
    seen.add(m.cuisine);
    out.push(m.cuisine);
    if (out.length >= 3) break;
  }
  return out;
}

function topRotationMealNames(staples) {
  return staples
    .filter((m) => m && typeof m.name === 'string')
    .slice(0, 3)
    .map((m) => m.name);
}

function topAspirationNames(aspirations) {
  return aspirations
    .filter((m) => m && typeof m.name === 'string')
    .slice(0, 2)
    .map((m) => m.name);
}

router.post('/submit', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const answers = normalizeOnboardingAnswers(req.body || {});
    const staplesList = getStaplesList(answers);
    const aspirationsList = getAspirationsList(answers);
    const staplesText = staplesListToDescription(staplesList);
    const aspirationsText = aspirationsListToDescription(aspirationsList);
    const discoveryPace = parseDiscoveryPace(answers);

    const scores = scoreFromStructured(answers);

    let llmParse = {
      staples_cuisines: [],
      staples_complexity: 'moderate',
      aspiration_specificity: 'none',
      aspiration_ambition: 'low',
    };

    const aspirationForParse = answers.q8 && String(answers.q8).trim() ? answers.q8 : aspirationsText;

    const hasFreeText =
      (answers.q8 && String(answers.q8).trim()) ||
      aspirationsText ||
      staplesText ||
      (staplesList.some((m) => m && m.custom));

    if (hasFreeText && isAzureConfigured()) {
      try {
        const prompt = buildParseFreeTextPrompt({
          staples: staplesText,
          aspiration: aspirationForParse || '(no answer)',
        });
        const raw = await createJsonCompletion([{ role: 'user', content: prompt }], 0.3);
        const parsed = JSON.parse(raw);
        llmParse = { ...llmParse, ...parsed };
      } catch (err) {
        console.warn('LLM parse failed, using defaults:', err.message);
      }
    }

    const finalScores = applyLLMParse(scores, llmParse, answers);
    const [primary, secondary] = getTopTwoDimensions(finalScores);
    const buildName = getBuildName(primary, secondary);
    const overallScore = computeOverallScore(finalScores);

    const rotationCuisines = [...new Set(staplesList.map((m) => m && m.cuisine).filter(Boolean))];
    const cuisineTags = llmParse.staples_cuisines?.length
      ? llmParse.staples_cuisines
      : rotationCuisines.length
        ? rotationCuisines.slice(0, 3)
        : ['American'];

    const rotationCuisineTags = topRotationCuisines(staplesList);
    const rotationMealNames = topRotationMealNames(staplesList);
    const aspirationNames = topAspirationNames(aspirationsList);

    const chefCardProfile = {
      build_name: buildName,
      overall_score: overallScore,
      score_comfort: finalScores.Comfort,
      score_speed: finalScores.Speed,
      score_boldness: finalScores.Boldness,
      score_discovery: finalScores.Discovery,
      score_nourishment: finalScores.Nourishment,
      top_two_dimensions: `${primary}, ${secondary}`,
      cuisine_tags: cuisineTags,
      staples: staplesText,
      aspiration: aspirationsText || answers.q8 || '',
      discovery_dial: String(discoveryPace),
      nutrition_priority: answers.q4 || '',
    };

    let tagline = `You're ${buildName} — and we're here to make meal planning feel effortless.`;
    let comparisons = [
      { name: 'The Weeknight Pro', desc: 'Gets dinner on the table without fuss.', match: 85 },
      { name: 'The Flavor Curious', desc: 'Loves trying new things when time allows.', match: 78 },
      { name: 'The Family Feeder', desc: 'Puts the people at the table first.', match: 72 },
    ];

    if (isAzureConfigured()) {
      try {
        const taglineUserJson = buildTaglineUserJson({
          build_type: buildName,
          top_rotation_cuisines: rotationCuisineTags.length ? rotationCuisineTags : cuisineTags.slice(0, 3),
          top_rotation_meals: rotationMealNames,
          top_aspirations: aspirationNames,
          discovery_pace: discoveryPace,
        });
        const taglineRaw = await createJsonCompletion(
          [
            { role: 'system', content: TAGLINE_SYSTEM_PROMPT },
            { role: 'user', content: taglineUserJson },
          ],
          0.5,
        );
        const taglineParsed = JSON.parse(taglineRaw);
        if (taglineParsed.tagline && typeof taglineParsed.tagline === 'string') {
          tagline = taglineParsed.tagline;
        }
      } catch (err) {
        console.warn('Tagline LLM failed, using default:', err.message);
      }

      try {
        const compPrompt = buildGenerateChefCardComparisonsPrompt(chefCardProfile);
        const compRaw = await createJsonCompletion([{ role: 'user', content: compPrompt }], 0.6);
        const compParsed = JSON.parse(compRaw);
        if (Array.isArray(compParsed.comparisons) && compParsed.comparisons.length >= 3) {
          comparisons = compParsed.comparisons.slice(0, 3);
        }
      } catch (err) {
        console.warn('Comparisons LLM failed, using mock:', err.message);
      }
    }

    const chefCardPayload = {
      buildName,
      overallScore,
      tagline,
      comparisons,
      dimensionScores: finalScores,
      cuisineTags,
      rotationCuisineTags,
      aspirationMeals: aspirationNames,
    };

    if (isSupabaseConfigured && supabase) {
      const { error: dbError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          chef_card: chefCardPayload,
          onboarding_answers: answers,
          discovery_pace: discoveryPace,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (dbError) {
        console.warn('Failed to persist chef card:', dbError.message);
      } else {
        try {
          await replaceUserStaples(userId, staplesList);
        } catch (syncErr) {
          console.warn('Failed to sync staples:', syncErr.message);
        }
        try {
          await replaceOnboardingUserMeals(userId, staplesList, aspirationsList);
        } catch (umErr) {
          console.warn('Failed to sync user_meals:', umErr.message);
        }
      }
    }

    res.json({
      ok: true,
      chefCard: chefCardPayload,
      profile: {
        ...answers,
        parsedFreeText: llmParse,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
