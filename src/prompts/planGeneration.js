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
  microwave_only: 'Microwave',
};

const Q6_TO_MINUTES = {
  under_20: 20,
  '30': 30,
  '45': 45,
  '60_plus': 60,
};

/**
 * discovery_pace 1 = 1 aspiration slot, pace 5 = 3 aspiration slots
 * // SPEC GAP: comment contradicts Math.floor(1 * 0.6) === 0; formula implemented exactly as written below.
 */
function getSlotAllocation(discoveryPace, totalMeals = 7) {
  const aspirationSlots = Math.min(Math.floor(discoveryPace * 0.6), 3);
  const rotationSlots = totalMeals - aspirationSlots;
  return { rotationSlots, aspirationSlots };
}

const SYSTEM_PROMPT = `You are a meal planning assistant for busy families.
Return ONLY a valid JSON object with a "meals" key containing an array. No prose. No markdown. No explanation.
The "meals" array must contain exactly 7 dinner objects.

Each object:
{
  "day": string,              // "Monday" through "Sunday"
  "meal_id": string,          // UUID from the provided rotation or aspiration catalog lists
  "name": string,             // meal name, max 5 words
  "description": string,      // one sentence, max 15 words
  "cookTime": number,         // minutes
  "servings": number,
  "cuisine": string,
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": string[],    // 4-8 items, scaled to family size
  "source_type": "rotation" | "aspiration",
  "reason_tag": string        // plain language; for aspiration slots use exactly: "You said you wanted to try this."
}`;

function formatMealsForPrompt(items) {
  if (!Array.isArray(items) || items.length === 0) return 'none';
  return items
    .map((m) => {
      if (!m || typeof m.name !== 'string') return '';
      const id = m.id || m.meal_id || '';
      const c = m.cuisine ? ` [${m.cuisine}]` : '';
      return id ? `${m.name}${c} (meal_id: ${id})` : `${m.name}${c}`;
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

  const discoveryPace =
    profile.discovery_pace != null && Number.isFinite(Number(profile.discovery_pace))
      ? Math.min(5, Math.max(1, Math.round(Number(profile.discovery_pace))))
      : parseInt(a.q9, 10) || 3;

  const { rotationSlots, aspirationSlots } = getSlotAllocation(discoveryPace, 7);

  const rotationBlock = formatMealsForPrompt(profile.rotation_meals);
  const aspirationBlock = formatMealsForPrompt(profile.aspiration_meals);

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

Discovery pace (1-5): ${discoveryPace}

Slot allocation (hard constraints):
- Draw exactly ${rotationSlots} meals from the user's rotation list below. Each must use source_type "rotation" and a meal_id from that list.
- Draw exactly ${aspirationSlots} meals from the user's aspiration list below. Each must use source_type "aspiration" and a meal_id from that list.
- For aspiration slots, introduce one aspiration meal the user has not had in a plan before when possible; calibrate to their skill level and equipment.
- The reason_tag for every aspiration-slot meal must be exactly: "You said you wanted to try this."

Rotation meals (catalog):
${rotationBlock}

Aspiration meals (catalog):
${aspirationBlock}

Generate 7 dinners for Monday through Sunday.
Vary cuisines — no two meals from the same cuisine unless family profile strongly prefers it.
Scale all ingredient quantities to ${familySize} servings.
Every meal must fit within ${maxCookTime} minutes.
The reason_tag for rotation meals should reference something specific from this family's profile (not generic).`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  };
}

module.exports = {
  buildPlanPrompt,
  SYSTEM_PROMPT,
  getSlotAllocation,
};
