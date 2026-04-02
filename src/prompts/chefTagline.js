/**
 * OB-05: Chef Card tagline — dedicated JSON completion (system + user inputs).
 */

const TAGLINE_SYSTEM_PROMPT = `You are writing a one-sentence Chef Card tagline for a family meal planning app called Melu.

The tagline must:
- Reference the user's cooking identity (what they already cook well — their rotation)
- Reference their top aspiration (what they want to learn to cook)
- Feel personal, warm, and specific — not generic
- Be a single sentence, 20 words maximum
- Never use the words "journey", "adventure", "explore", or "discover"

Inputs you will receive:
- build_type: the user's named cook archetype (e.g. "The Quick Fire")
- top_rotation_cuisines: array of cuisine strings from their rotation (e.g. ["Italian", "Mexican", "American"])
- top_rotation_meals: array of 3 meal name strings from their rotation (e.g. ["Pizza", "Enchiladas", "Burgers"])
- top_aspirations: array of 1-2 meal name strings from their aspirations list (e.g. ["Thai curry", "Korean BBQ"])
- discovery_pace: integer 1-5

Output: a single JSON object with one field:
{ "tagline": "..." }

No preamble. No markdown. JSON only.

Example output:
{ "tagline": "Fast, family-tested Italian and Mexican on lock — with Thai curry next on your list." }

If top_aspirations is empty, omit any reference to aspirations and write the tagline from rotation identity only.`;

/**
 * @param {object} inputs
 * @param {string} inputs.build_type
 * @param {string[]} inputs.top_rotation_cuisines
 * @param {string[]} inputs.top_rotation_meals
 * @param {string[]} inputs.top_aspirations
 * @param {number} inputs.discovery_pace
 */
function buildTaglineUserJson(inputs) {
  return JSON.stringify({
    build_type: inputs.build_type,
    top_rotation_cuisines: inputs.top_rotation_cuisines,
    top_rotation_meals: inputs.top_rotation_meals,
    top_aspirations: inputs.top_aspirations,
    discovery_pace: inputs.discovery_pace,
  });
}

module.exports = {
  TAGLINE_SYSTEM_PROMPT,
  buildTaglineUserJson,
};
