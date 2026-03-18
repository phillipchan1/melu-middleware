const GENERATE_CHEF_CARD_PROMPT = `You are generating a Chef Card for a family meal planning app called Melu. The Chef Card is shown to the user at the end of onboarding as their personalized cooking identity.

Return only a valid JSON object. No markdown, no explanation.

The Family Profile below includes their 5 dimension scores (0–100), their build name, their staples, aspiration, and chaos night answers.

Return exactly this structure:
{
  "tagline": string,
  "comparisons": [
    { "name": string, "desc": string, "match": number },
    { "name": string, "desc": string, "match": number },
    { "name": string, "desc": string, "match": number }
  ]
}

Rules:
- tagline: one sentence, second person ("You're..."), max 25 words. Must reference something real — their staples, their chaos night answer, or their aspiration. Warm and specific. Not generic. Bad example: "You're a home cook who loves feeding your family." Good example: "You've got tacos and pasta locked — Melu is here to build out the rest of the week around them."
- comparisons: 3 cooking personality archetypes. These are fun, food-native personas — not real people. Each has a name, a one-sentence desc (max 15 words), and a match integer.
- match values must be in descending order, range 70–97.
- Archetype names should be evocative and kitchen-native (e.g. "The Sunday Slow Roaster", "The 20-Minute Closer", "The Flavor Chaser"). No celebrity names. No chef-title names.

Family Profile:
- Build name: {{build_name}}
- Overall score: {{overall_score}}
- Scores — Comfort: {{score_comfort}}, Speed: {{score_speed}}, Boldness: {{score_boldness}}, Discovery: {{score_discovery}}, Nourishment: {{score_nourishment}}
- Top two dimensions: {{top_two_dimensions}}
- Cuisine tags: {{cuisine_tags}}
- Staples: {{staples}}
- Aspiration: {{aspiration}}
- Chaos night: {{chaos_night}}
- Discovery dial: {{discovery_dial}}
- Nutrition priority: {{nutrition_priority}}`;

function buildGenerateChefCardPrompt(profile) {
  return GENERATE_CHEF_CARD_PROMPT
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
    .replace('{{chaos_night}}', profile.chaos_night || '')
    .replace('{{discovery_dial}}', profile.discovery_dial || '')
    .replace('{{nutrition_priority}}', profile.nutrition_priority || '');
}

module.exports = {
  GENERATE_CHEF_CARD_PROMPT,
  buildGenerateChefCardPrompt,
};
