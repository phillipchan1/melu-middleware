/** Comparisons-only completion (tagline uses chefTagline.js). */
const GENERATE_CHEF_CARD_COMPARISONS_PROMPT = `You are generating Chef Card comparison rows for a family meal planning app called Melu.

Return only a valid JSON object. No markdown, no explanation.

Return exactly this structure:
{
  "comparisons": [
    { "name": string, "desc": string, "match": number },
    { "name": string, "desc": string, "match": number },
    { "name": string, "desc": string, "match": number }
  ]
}

Rules:
- comparisons: 3 cooking personality archetypes. These are fun, food-native personas — not real people. Each has a name, a one-sentence desc (max 15 words), and a match integer.
- match values must be in descending order, range 70–97.
- Archetype names should be evocative and kitchen-native (e.g. "The Sunday Slow Roaster", "The 20-Minute Closer", "The Flavor Chaser"). No celebrity names. No chef-title names.

Family Profile:
- Build name: {{build_name}}
- Overall score: {{overall_score}}
- Scores — Comfort: {{score_comfort}}, Speed: {{score_speed}}, Boldness: {{score_boldness}}, Discovery: {{score_discovery}}, Nourishment: {{score_nourishment}}
- Top two dimensions: {{top_two_dimensions}}
- Cuisine tags: {{cuisine_tags}}
- Rotation summary: {{staples}}
- Aspiration summary: {{aspiration}}
- Discovery pace (1-5): {{discovery_dial}}
- Nutrition priority: {{nutrition_priority}}`;

function buildGenerateChefCardComparisonsPrompt(profile) {
  return GENERATE_CHEF_CARD_COMPARISONS_PROMPT
    .replace('{{build_name}}', profile.build_name || '')
    .replace('{{overall_score}}', String(profile.overall_score ?? 0))
    .replace('{{score_comfort}}', String(profile.score_comfort ?? 0))
    .replace('{{score_speed}}', String(profile.score_speed ?? 0))
    .replace('{{score_boldness}}', String(profile.score_boldness ?? 0))
    .replace('{{score_discovery}}', String(profile.score_discovery ?? 0))
    .replace('{{score_nourishment}}', String(profile.score_nourishment ?? 0))
    .replace('{{top_two_dimensions}}', profile.top_two_dimensions || '')
    .replace('{{cuisine_tags}}', Array.isArray(profile.cuisine_tags) ? profile.cuisine_tags.join(', ') : '')
    .replace('{{staples}}', profile.staples || '')
    .replace('{{aspiration}}', profile.aspiration || '')
    .replace('{{discovery_dial}}', profile.discovery_dial || '')
    .replace('{{nutrition_priority}}', profile.nutrition_priority || '');
}

/** @deprecated Use buildGenerateChefCardComparisonsPrompt */
const GENERATE_CHEF_CARD_PROMPT = GENERATE_CHEF_CARD_COMPARISONS_PROMPT;

function buildGenerateChefCardPrompt(profile) {
  return buildGenerateChefCardComparisonsPrompt(profile);
}

module.exports = {
  GENERATE_CHEF_CARD_PROMPT,
  GENERATE_CHEF_CARD_COMPARISONS_PROMPT,
  buildGenerateChefCardPrompt,
  buildGenerateChefCardComparisonsPrompt,
};
