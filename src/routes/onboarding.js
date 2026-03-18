const express = require('express');
const { createJsonCompletion, isAzureConfigured } = require('../services/azureOpenAI');
const { buildParseFreeTextPrompt } = require('../prompts/parseFreeText');
const { buildGenerateChefCardPrompt } = require('../prompts/generateChefCard');
const {
  scoreFromStructured,
  applyLLMParse,
  getTopTwoDimensions,
  getBuildName,
  computeOverallScore,
} = require('../services/onboardingScoring');

const router = express.Router();

router.post('/submit', async (req, res, next) => {
  try {
    const answers = req.body || {};

    const scores = scoreFromStructured(answers);

    let llmParse = {
      staples_cuisines: [],
      staples_complexity: 'moderate',
      aspiration_specificity: 'none',
      aspiration_ambition: 'low',
      chaos_night_class: 'simple_home_cook',
    };

    const hasFreeText = answers.q6 || answers.q7 || answers.q11;
    if (hasFreeText && isAzureConfigured()) {
      try {
        const prompt = buildParseFreeTextPrompt({
          staples: answers.q6,
          aspiration: answers.q7,
          chaos_night: answers.q11,
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

    const cuisineTags = llmParse.staples_cuisines?.length
      ? llmParse.staples_cuisines
      : ['American'];

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
      staples: answers.q6 || '',
      aspiration: answers.q7 || '',
      chaos_night: answers.q11 || '',
      discovery_dial: answers.q9 || '',
      nutrition_priority: answers.q3b || '',
    };

    let chefCard;
    if (isAzureConfigured()) {
      try {
        const chefCardPrompt = buildGenerateChefCardPrompt(chefCardProfile);
        const chefCardRaw = await createJsonCompletion(
          [{ role: 'user', content: chefCardPrompt }],
          0.6,
        );
        chefCard = JSON.parse(chefCardRaw);
      } catch (err) {
        console.warn('LLM Chef Card failed, using mock:', err.message);
        chefCard = buildMockChefCard(buildName);
      }
    } else {
      chefCard = buildMockChefCard(buildName);
    }

    res.json({
      ok: true,
      chefCard: {
        buildName,
        overallScore,
        tagline: chefCard.tagline,
        comparisons: chefCard.comparisons || [],
        dimensionScores: finalScores,
        cuisineTags,
      },
      profile: {
        ...answers,
        parsedFreeText: llmParse,
      },
    });
  } catch (error) {
    next(error);
  }
});

function buildMockChefCard(buildName) {
  return {
    tagline: `You're ${buildName} — and we're here to make meal planning feel effortless.`,
    comparisons: [
      { name: 'The Weeknight Pro', desc: 'Gets dinner on the table without fuss.', match: 85 },
      { name: 'The Flavor Curious', desc: 'Loves trying new things when time allows.', match: 78 },
      { name: 'The Family Feeder', desc: 'Puts the people at the table first.', match: 72 },
    ],
  };
}

module.exports = router;
