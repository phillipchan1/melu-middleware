/**
 * PG-01: Plan generation prompt.
 * Isolated file — edit this to iterate on plan quality without touching route logic.
 */

const Q5_LABELS = {
  oven: 'Oven',
  stovetop: 'Stovetop',
  air_fryer: 'Air fryer',
  instant_pot: 'Instant pot',
  slow_cooker: 'Slow cooker',
  grill: 'Grill',
  microwave_only: 'Microwave only',
};

const Q6_TO_MINUTES = {
  under_20: 20,
  '30': 30,
  '45': 45,
  '60_plus': 60,
};

const SYSTEM_PROMPT = `You are a meal planning assistant for busy families.
Return ONLY a valid JSON object with a "meals" key containing an array. No prose. No markdown. No explanation.
The "meals" array must contain exactly 7 dinner objects.

Each object:
{
  "day": string,              // "Monday" through "Sunday"
  "name": string,             // meal name, max 5 words
  "description": string,      // one sentence, max 15 words
  "cookTime": number,         // minutes
  "servings": number,
  "cuisine": string,
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": string[],    // 4-8 items, scaled to family size
  "reasonTag": string         // plain language reason this meal fits this family, max 10 words
}`;

function formatStaplesForPrompt(staples) {
  if (!Array.isArray(staples) || staples.length === 0) return 'not specified';
  return staples
    .map((m) => {
      if (!m || typeof m.name !== 'string') return '';
      const c = m.cuisine ? ` [${m.cuisine}]` : '';
      return `${m.name}${c}`;
    })
    .filter(Boolean)
    .join('; ');
}

function buildPlanPrompt(profile) {
  const a = profile.onboarding_answers || {};
  const q1 = a.q1 || {};
  const cc = profile.chef_card || {};
  const dims = cc.dimensionScores || {};

  const familySize = (q1.adults || 0) + (q1.kids || 0) || 1;
  const kidsAges = Array.isArray(q1.kidAges) ? q1.kidAges.join(', ') : 'none';
  const allergies = Array.isArray(a.q2) && a.q2.length ? a.q2.join(', ') : 'none';
  const dietaryRestrictions = Array.isArray(a.q3) && a.q3.length ? a.q3.join(', ') : 'none';

  const equipmentKeys = Array.isArray(a.q5) && a.q5.length
    ? a.q5
    : Array.isArray(a.q4)
      ? a.q4
      : [];
  const availableEquipment = equipmentKeys.length
    ? equipmentKeys.map((v) => Q5_LABELS[v] || v).join(', ')
    : 'oven, stovetop';

  const cookKey =
    typeof a.q6 === 'string' && a.q6
      ? a.q6
      : typeof a.q5 === 'string' && a.q5 && !Array.isArray(a.q5)
        ? a.q5
        : '';
  const maxCookTime = Q6_TO_MINUTES[cookKey] || 45;

  const staplesFromDb = Array.isArray(profile.staples) ? profile.staples : [];
  const staplesFromAnswers = Array.isArray(a.staples)
    ? a.staples
    : Array.isArray(a.q7)
      ? a.q7
      : [];
  const staplesList = staplesFromDb.length > 0 ? staplesFromDb : staplesFromAnswers;
  const staplesBlock = formatStaplesForPrompt(staplesList);
  const aspirationMeal = typeof a.q8 === 'string' ? a.q8.trim() : '';
  const adventureLevel = parseInt(a.q9, 10) || 3;

  const buildType = cc.buildName || 'The Dependable Dash';
  const dimensionComfort = dims.Comfort ?? 50;
  const dimensionSpeed = dims.Speed ?? 50;
  const dimensionBoldness = dims.Boldness ?? 50;
  const dimensionDiscovery = dims.Discovery ?? 50;
  const dimensionNourishment = dims.Nourishment ?? 50;

  const userPrompt = `Family: ${familySize} people. Kids ages: ${kidsAges}.
Hard allergies (never include): ${allergies}.
Dietary restrictions: ${dietaryRestrictions}.
Available equipment: ${availableEquipment}.
Max cook time per weeknight: ${maxCookTime} minutes.

Family flavor profile — Chef Card build: ${buildType}
Comfort score: ${dimensionComfort}/100 — higher means rely on familiar meals
Speed score: ${dimensionSpeed}/100 — higher means prioritize fast, low-effort meals
Boldness score: ${dimensionBoldness}/100 — higher means embrace spice and complexity
Discovery score: ${dimensionDiscovery}/100 — higher means introduce new cuisines and techniques
Nourishment score: ${dimensionNourishment}/100 — higher means prioritize clean, balanced ingredients

Dinner staples (meals this family already trusts — prioritize 2–3 of these across the week when possible): ${staplesBlock}.
Aspiration meal they want to try: ${aspirationMeal || 'not specified'}.
Adventure level: ${adventureLevel}/5 — use this to calibrate how many new meals vs staple-style meals to include.

Generate 7 dinners for Monday through Sunday.
Vary cuisines — no two meals from the same cuisine unless family profile strongly prefers it.
Scale all ingredient quantities to ${familySize} servings.
Every meal must fit within ${maxCookTime} minutes.
The reasonTag for each meal must reference something specific from this family's profile.`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  };
}

module.exports = {
  buildPlanPrompt,
  SYSTEM_PROMPT,
};
