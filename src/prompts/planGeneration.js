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

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_SELECTED_NIGHTS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * discovery_pace 1 = 1 aspiration slot, pace 5 = 3 aspiration slots
 */
function getSlotAllocation(discoveryPace, totalMeals = 7) {
  const aspirationSlots = Math.min(Math.floor(discoveryPace * 0.6), 3, totalMeals);
  const stapleSlots = totalMeals - aspirationSlots;
  return { stapleSlots, aspirationSlots };
}

function buildSystemPrompt(totalMeals, selectedNights) {
  const nightsLine = selectedNights.join(', ');
  return `You are a meal planning assistant for busy families.
Return ONLY a valid JSON object. No prose. No markdown. No explanation.

Root object shape (required):
{
  "planSummary": string,
  "meals": [ ... ]
}

planSummary — one warm sentence, maximum 15 words. Required field.
- If weeklyContext was provided: directly acknowledge it and preview how the plan responds.
  Examples:
  "Got it — Thursday is impressive for guests, rest stays fast."
  "Built around your leftovers — two meals use that chicken."
  "Kept it simple this week — light on shopping, heavy on staples."
- If no weeklyContext: reference one specific thing from this family's profile — a named staple, their top cuisine, or their pace.
  Examples:
  "Built around your staples with one new dish from your wishlist."
  "Heavy on Mexican this week — it's your family's sweet spot."
- Never generic ("here is your plan", "enjoy your meals", "here you go").
- Always specific to this family. Always one sentence.

The "meals" array must contain exactly ${totalMeals} dinner objects, one per requested night.

Each meal must use a distinct "day" from this list (use each listed day exactly once, in any order within the array): ${nightsLine}.

Each meal object:
{
  "day": string,              // one of: ${nightsLine}
  "meal_id": string,          // UUID from the provided staple or aspiration catalog lists
  "name": string,             // meal name, max 5 words
  "description": string,      // one sentence, max 15 words
  "cookTime": number,         // minutes
  "servings": number,
  "cuisine": string,
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": string[],    // 4-8 items, scaled to family size
  "source_type": "staple" | "aspiration",
  "reason_tag": string
}

reason_tag rules:
- For aspiration meals: always "You said you wanted to try this."
- For staple meals (source_type "staple"): if weeklyContext mentions a specific constraint (guests, busy night, quick meal, leftover ingredient), AND this meal directly addresses that constraint, use a context-specific tag:
  - guests mentioned → "Great for guests"
  - speed/quick/fast/busy mentioned → "Fast — under [cookTime] min" (use this meal's actual cookTime)
  - leftover ingredient mentioned and used → "Uses your [ingredient]"
  - simple/easy/light mentioned → "Simple and easy this week"
  - Otherwise: use a profile-specific tag referencing something real about this family (their cuisine preference, a named staple, etc.)
  Never use generic tags like "Your go-to" unless nothing more specific applies.`;
}

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

/**
 * @param {object} profile - chef card, onboarding answers, staple/aspiration meals
 * @param {{ selectedNights?: string[]; weeklyContext?: string; todayDate?: string }} [opts]
 */
function buildPlanPrompt(profile, opts = {}) {
  const selectedNightsRaw = Array.isArray(opts.selectedNights) ? opts.selectedNights : DEFAULT_SELECTED_NIGHTS;
  const allowed = new Set(WEEK_ORDER);
  const selectedNights = [...new Set(selectedNightsRaw.filter((d) => typeof d === 'string' && allowed.has(d)))].sort(
    (a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b),
  );
  const nights = selectedNights.length > 0 ? selectedNights : DEFAULT_SELECTED_NIGHTS;
  const totalMeals = nights.length;

  const weeklyContext =
    typeof opts.weeklyContext === 'string' && opts.weeklyContext.trim().length > 0
      ? opts.weeklyContext.trim()
      : '';

  const todayDate =
    typeof opts.todayDate === 'string' && opts.todayDate.trim().length > 0 ? opts.todayDate.trim() : '';

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

  const { stapleSlots, aspirationSlots } = getSlotAllocation(discoveryPace, totalMeals);

  const stapleBlock = formatMealsForPrompt(profile.staple_meals);
  const aspirationBlock = formatMealsForPrompt(profile.aspiration_meals);

  const buildType = cc.buildName || 'The Dependable Dash';
  const dimensionComfort = dims.Comfort ?? 50;
  const dimensionSpeed = dims.Speed ?? 50;
  const dimensionBoldness = dims.Boldness ?? 50;
  const dimensionDiscovery = dims.Discovery ?? 50;
  const dimensionNourishment = dims.Nourishment ?? 50;

  const contextBlock = weeklyContext
    ? `Weekly context from the user (honor when planning meals and reason_tag text where relevant):
${weeklyContext}`
    : 'No additional free-text context for this week.';

  const referenceDateBlock = todayDate
    ? `Reference date (today, from client, ISO): ${todayDate}`
    : '';

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

${referenceDateBlock}

${contextBlock}

Slot allocation (hard constraints):
- Draw exactly ${stapleSlots} meals from the user's staples list below. Each must use source_type "staple" and a meal_id from that list.
- Draw exactly ${aspirationSlots} meals from the user's aspiration list below. Each must use source_type "aspiration" and a meal_id from that list.
- For aspiration slots, introduce one aspiration meal the user has not had in a plan before when possible; calibrate to their skill level and equipment.
- Follow planSummary and reason_tag rules from the system message exactly.

Staple meals (catalog):
${stapleBlock}

Aspiration meals (catalog):
${aspirationBlock}

Generate dinners for these specific nights only: ${nights.join(', ')}. Do not include any other nights.
Generate exactly ${totalMeals} dinners, one per requested night.
Vary cuisines — no two meals from the same cuisine unless family profile strongly prefers it.
Scale all ingredient quantities to ${familySize} servings.
Every meal must fit within ${maxCookTime} minutes.`;

  return {
    system: buildSystemPrompt(totalMeals, nights),
    user: userPrompt,
  };
}

module.exports = {
  buildPlanPrompt,
  getSlotAllocation,
  WEEK_ORDER,
  DEFAULT_SELECTED_NIGHTS,
};
