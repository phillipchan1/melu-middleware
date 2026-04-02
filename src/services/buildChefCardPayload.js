/**
 * Builds Chef Card payload (scoring + LLM tagline + comparisons) from persisted onboarding answers
 * and user_meals (via fetchUserMealsForPlan) for tagline inputs.
 */

const { createJsonCompletion, isAzureConfigured } = require('./azureOpenAI');
const { buildParseFreeTextPrompt } = require('../prompts/parseFreeText');
const { buildGenerateChefCardComparisonsPrompt } = require('../prompts/generateChefCard');
const { TAGLINE_SYSTEM_PROMPT, buildTaglineUserJson } = require('../prompts/chefTagline');
const {
  scoreFromStructured,
  applyLLMParse,
  getTopTwoDimensions,
  getBuildName,
  computeOverallScore,
} = require('./onboardingScoring');
const {
  staplesListToDescription,
  getStaplesList,
  getAspirationsList,
  aspirationsListToDescription,
} = require('../lib/normalizeOnboardingAnswers');
const { fetchUserMealsForPlan } = require('../lib/userMealsDb');

function parseDiscoveryPace(answers) {
  if (answers.discoveryPace != null && Number.isFinite(Number(answers.discoveryPace))) {
    return Math.min(5, Math.max(1, Math.round(Number(answers.discoveryPace))));
  }
  const q9 = answers.q9 != null ? parseInt(String(answers.q9), 10) : NaN;
  if (Number.isFinite(q9)) return Math.min(5, Math.max(1, q9));
  return 3;
}

function topStapleCuisinesFromStaples(staples) {
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

function topStapleMealNamesFromStaples(staples) {
  return staples
    .filter((m) => m && typeof m.name === 'string')
    .slice(0, 3)
    .map((m) => m.name);
}

function topAspirationNamesFromList(aspirations) {
  return aspirations
    .filter((m) => m && typeof m.name === 'string')
    .slice(0, 2)
    .map((m) => m.name);
}

/**
 * Tagline inputs from user_meals (preferred) or fallback to onboarding staples/aspirations lists.
 * @param {string} userId
 * @param {object} answers — normalized onboarding answers
 */
async function taglineInputsFromUserMealsOrAnswers(userId, answers) {
  const staplesList = getStaplesList(answers);
  const aspirationsList = getAspirationsList(answers);

  let stapleMealNames = topStapleMealNamesFromStaples(staplesList);
  let stapleCuisineTags = topStapleCuisinesFromStaples(staplesList);
  let aspirationNames = topAspirationNamesFromList(aspirationsList);

  try {
    const { staples, aspiration } = await fetchUserMealsForPlan(userId);
    if (staples.length > 0) {
      stapleMealNames = staples.slice(0, 3).map((m) => m.name);
      const seen = new Set();
      const cuisines = [];
      for (const s of staples) {
        if (s.cuisine && !seen.has(s.cuisine)) {
          seen.add(s.cuisine);
          cuisines.push(s.cuisine);
          if (cuisines.length >= 3) break;
        }
      }
      if (cuisines.length > 0) stapleCuisineTags = cuisines;
    }
    if (aspiration.length > 0) {
      aspirationNames = aspiration.slice(0, 2).map((m) => m.name);
    }
  } catch (e) {
    console.warn('fetchUserMealsForPlan for tagline:', e.message);
  }

  return {
    stapleMealNames,
    stapleCuisineTags,
    aspirationNames,
    staplesList,
    aspirationsList,
  };
}

/**
 * @param {object} params
 * @param {object} params.answers — normalized onboarding answers
 * @param {string} params.userId
 * @returns {Promise<object>} chefCardPayload (client shape)
 */
async function buildChefCardPayload({ answers, userId }) {
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
    staplesList.some((m) => m && m.custom);

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

  const cuisinesFromAnswers = [...new Set(staplesList.map((m) => m && m.cuisine).filter(Boolean))];
  const cuisineTags = llmParse.staples_cuisines?.length
    ? llmParse.staples_cuisines
    : cuisinesFromAnswers.length
      ? cuisinesFromAnswers.slice(0, 3)
      : ['American'];

  const {
    stapleMealNames,
    stapleCuisineTags,
    aspirationNames,
  } = await taglineInputsFromUserMealsOrAnswers(userId, answers);

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
        top_staple_cuisines: stapleCuisineTags.length ? stapleCuisineTags : cuisineTags.slice(0, 3),
        top_staple_meals: stapleMealNames,
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
    stapleCuisineTags: stapleCuisineTags.length ? stapleCuisineTags : topStapleCuisinesFromStaples(staplesList),
    aspirationMeals: aspirationNames,
  };

  return { chefCardPayload, discoveryPace };
}

module.exports = {
  buildChefCardPayload,
  parseDiscoveryPace,
};
