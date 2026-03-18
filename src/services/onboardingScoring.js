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

const DIMENSIONS = ['Comfort', 'Speed', 'Boldness', 'Discovery', 'Nourishment'];

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function scoreFromStructured(answers) {
  const scores = { Comfort: 50, Speed: 50, Boldness: 50, Discovery: 50, Nourishment: 50 };

  // Q5 — cook time -> Speed
  const q5Scores = { 'under_20': 90, '30': 75, '45': 55, '60_plus': 35 };
  if (answers.q5 && q5Scores[answers.q5] !== undefined) {
    scores.Speed = q5Scores[answers.q5];
  }

  // Q3b — nutrition priority -> Nourishment
  const q3bScores = { 'just_dinner': 25, 'balanced': 50, 'priority': 75, 'non_negotiable': 95 };
  if (answers.q3b && q3bScores[answers.q3b] !== undefined) {
    scores.Nourishment = q3bScores[answers.q3b];
  }

  // Q2, Q3 — allergies + dietary -> Nourishment (more restrictions = higher consciousness)
  const allergyCount = Array.isArray(answers.q2) ? answers.q2.length : 0;
  const dietaryCount = Array.isArray(answers.q3) ? answers.q3.length : 0;
  if (allergyCount + dietaryCount > 0) {
    scores.Nourishment = clamp(scores.Nourishment + (allergyCount + dietaryCount) * 8, 0, 100);
  }

  // Q8 — flavor profile -> Boldness
  const boldFlavors = ['bold_spicy', 'umami_forward'];
  const q8 = Array.isArray(answers.q8) ? answers.q8 : [];
  const boldCount = q8.filter((f) => boldFlavors.includes(f)).length;
  if (boldCount > 0) {
    scores.Boldness = clamp(scores.Boldness + boldCount * 15, 0, 100);
  }

  // Q9 — adventurousness (1-5) -> Discovery
  const q9Scores = { '1': 20, '2': 40, '3': 60, '4': 80, '5': 95 };
  if (answers.q9 && q9Scores[answers.q9] !== undefined) {
    scores.Discovery = q9Scores[answers.q9];
  }

  // Q12 — new vs familiar -> Comfort + Discovery
  if (answers.q12 === 'nailing_meals') {
    scores.Comfort = 85;
    scores.Discovery = 30;
  } else if (answers.q12 === 'trying_new') {
    scores.Comfort = 35;
    scores.Discovery = 85;
  } else if (answers.q12 === 'both') {
    scores.Comfort = 60;
    scores.Discovery = 60;
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

  // chaos_night_class -> Speed
  if (llmParse.chaos_night_class === 'fast_frozen_delivery' || llmParse.chaos_night_class === 'skips') {
    next.Speed = clamp(next.Speed + 20, 0, 100);
  } else if (llmParse.chaos_night_class === 'real_meal') {
    next.Speed = clamp(next.Speed - 15, 0, 100);
  }

  // aspiration_ambition -> Discovery
  if (llmParse.aspiration_ambition === 'high') {
    next.Discovery = clamp(next.Discovery + 15, 0, 100);
  } else if (llmParse.aspiration_ambition === 'medium') {
    next.Discovery = clamp(next.Discovery + 5, 0, 100);
  }

  // aspiration_specificity -> Discovery (vague/specific = some interest)
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
