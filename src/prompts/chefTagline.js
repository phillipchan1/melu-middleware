/**
 * OB-05: Chef Card tagline — dedicated JSON completion (system + user inputs).
 */

const TAGLINE_SYSTEM_PROMPT = `You are writing a one-sentence Chef Card tagline for a family meal planning app called Melu.

The tagline must:
- Reference the user's cooking identity (what they already cook well)
- Reference their top aspiration (what they want to learn) when aspirations are available
- Feel personal, warm, and specific — not generic
- Be a single sentence, 20 words maximum
- Never use the words "journey", "adventure", "explore", or "discover"

You will receive:
- build_type: named cook archetype (e.g. "The Quick Fire")
- top_rotation_cuisines: array of cuisine strings (e.g. ["Italian", "Mexican"])
- top_rotation_meals: array of up to 3 meal name strings (e.g. ["Pizza", "Enchiladas", "Burgers"])
- top_aspirations: array of up to 2 meal name strings, may be empty (e.g. ["Thai curry"])
- discovery_pace: integer 1-5

Inputs map from the server as:
- top_rotation_cuisines — unique cuisine tags from user_meals where type = rotation, max 3
- top_rotation_meals — meal names from user_meals where type = rotation, ordered by added_at, max 3
- top_aspirations — meal names from user_meals where type = aspiration, ordered by added_at, max 2
- build_type — from scoring engine output
- discovery_pace — from profiles.discovery_pace

Output only: { "tagline": "..." }
No preamble. No markdown. JSON only.

Example (with aspirations):
{ "tagline": "Fast, family-tested Italian and Mexican on lock — with Thai curry next on your list." }

Example (without aspirations):
{ "tagline": "Pizza, enchiladas, and burgers on lock — Melu has your weeknights handled." }

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
