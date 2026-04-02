const BUILD_NAMES = {
  Comfort_Speed: 'The Dependable Dash',
  Comfort_Boldness: 'The Safe Bet with a Kick',
  Comfort_Discovery: 'The Homebody Who Wanders',
  Comfort_Nourishment: 'The Clean Plate Keeper',
  Speed_Comfort: 'The Fast Lane Regular',
  Speed_Boldness: 'The Quick Fire',
  Speed_Discovery: 'The Speedy Adventurer',
  Speed_Nourishment: 'The Efficient Nourisher',
  Boldness_Comfort: 'The Spicy Traditionalist',
  Boldness_Speed: 'The Wok Boss',
  Boldness_Discovery: 'The Flavor Explorer',
  Boldness_Nourishment: 'The Conscious Heat Seeker',
  Discovery_Comfort: 'The Curious Homecook',
  Discovery_Boldness: 'The Full Send',
  Discovery_Speed: 'The Fast Curious',
  Discovery_Nourishment: 'The Intentional Explorer',
  Nourishment_Comfort: 'The Wholesome Regular',
  Nourishment_Speed: 'The Efficient Nourisher',
  Nourishment_Boldness: 'The Mindful Flavor Chaser',
  Nourishment_Discovery: 'The Clean Plate Adventurer',
};

const { getStaplesList } = require('../lib/normalizeOnboardingAnswers');

const DIMENSIONS = ['Comfort', 'Speed', 'Boldness', 'Discovery', 'Nourishment'];

/** Cuisines that skew bolder / more intense (stub until OB-04 mapping is finalized). */
const BOLD_CUISINES = new Set(['Mexican', 'Indian', 'Asian', 'Middle Eastern', 'Other']);

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function boldnessFromStaples(staples) {
  if (!Array.isArray(staples) || staples.length === 0) return 50;
  let spicyHits = 0;
  for (const m of staples) {
    if (m && BOLD_CUISINES.has(m.cuisine)) {
      spicyHits += 1;
    }
  }
  const diversity = new Set(staples.map((m) => (m && m.cuisine) || '').filter(Boolean)).size;
  return clamp(45 + spicyHits * 6 + diversity * 4, 0, 100);
}

function scoreFromStructured(answers) {
  const staples = getStaplesList(answers);
  const scores = {
    Comfort: 50,
    Speed: 50,
    Boldness: boldnessFromStaples(staples),
    Discovery: 50,
    Nourishment: 50,
  };

  // Q6 — cook time -> Speed
  const q6Scores = { under_20: 90, '30': 75, '45': 55, '60_plus': 35 };
  if (answers.q6 && q6Scores[answers.q6] !== undefined) {
    scores.Speed = q6Scores[answers.q6];
  }

  // Q4 — nutrition priority -> Nourishment
  const q4Scores = { just_dinner: 25, balanced: 50, priority: 75, non_negotiable: 95 };
  if (answers.q4 && q4Scores[answers.q4] !== undefined) {
    scores.Nourishment = q4Scores[answers.q4];
  }

  // Q2, Q3 — allergies + dietary -> Nourishment (more restrictions = higher consciousness)
  const allergyCount = Array.isArray(answers.q2) ? answers.q2.length : 0;
  const dietaryCount = Array.isArray(answers.q3) ? answers.q3.length : 0;
  if (allergyCount + dietaryCount > 0) {
    scores.Nourishment = clamp(scores.Nourishment + (allergyCount + dietaryCount) * 8, 0, 100);
  }

  // Q3b legacy (pre-v2) — nutrition
  if (answers.q3b && q4Scores[answers.q3b] !== undefined) {
    scores.Nourishment = q4Scores[answers.q3b];
  }

  // Q5 legacy — cook time was q5 in v1
  if (answers.q5 && q6Scores[answers.q5] !== undefined && !answers.q6) {
    scores.Speed = q6Scores[answers.q5];
  }

  // discovery_pace or legacy Q9 — adventurousness (1-5) -> Discovery
  const q9Scores = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 95 };
  let paceKey = answers.q9;
  if (answers.discoveryPace != null && Number.isFinite(Number(answers.discoveryPace))) {
    paceKey = String(Math.min(5, Math.max(1, Math.round(Number(answers.discoveryPace)))));
  }
  if (paceKey && q9Scores[paceKey] !== undefined) {
    scores.Discovery = q9Scores[paceKey];
  }

  // Staples count -> Comfort (more known meals = higher comfort)
  if (staples.length >= 3) {
    scores.Comfort = clamp(scores.Comfort + 12, 0, 100);
  } else if (staples.length >= 1) {
    scores.Comfort = clamp(scores.Comfort + 5, 0, 100);
  }

  return scores;
}

function applyLLMParse(scores, llmParse, answers) {
  const next = { ...scores };

  // staples_complexity -> Comfort
  if (llmParse.staples_complexity === 'simple') {
    next.Comfort = clamp(next.Comfort + 15, 0, 100);
  } else if (llmParse.staples_complexity === 'complex') {
    next.Comfort = clamp(next.Comfort - 10, 0, 100);
  }

  // aspiration_ambition -> Discovery
  if (llmParse.aspiration_ambition === 'high') {
    next.Discovery = clamp(next.Discovery + 15, 0, 100);
  } else if (llmParse.aspiration_ambition === 'medium') {
    next.Discovery = clamp(next.Discovery + 5, 0, 100);
  }

  if (llmParse.aspiration_specificity === 'specific') {
    next.Discovery = clamp(next.Discovery + 10, 0, 100);
  }

  return next;
}

function getTopTwoDimensions(scores) {
  const entries = DIMENSIONS.map((d) => ({ dim: d, score: scores[d] }));
  entries.sort((a, b) => b.score - a.score);
  const first = entries[0];
  const second = entries[1];
  if (first.score === second.score) {
    const contribCount = { Comfort: 2, Speed: 2, Boldness: 3, Discovery: 3, Nourishment: 3 };
    return contribCount[first.dim] >= contribCount[second.dim]
      ? [first.dim, second.dim]
      : [second.dim, first.dim];
  }
  return [first.dim, second.dim];
}

function getBuildName(primary, secondary) {
  const key = `${primary}_${secondary}`;
  return BUILD_NAMES[key] || 'The Dependable Dash';
}

function computeOverallScore(scores) {
  const sum = DIMENSIONS.reduce((acc, d) => acc + scores[d], 0);
  return Math.round(sum / DIMENSIONS.length);
}

module.exports = {
  scoreFromStructured,
  applyLLMParse,
  getTopTwoDimensions,
  getBuildName,
  computeOverallScore,
  DIMENSIONS,
  BUILD_NAMES,
};
