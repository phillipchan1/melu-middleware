const PARSE_FREE_TEXT_PROMPT = `You are parsing onboarding answers for a meal planning app called Melu. Return only a valid JSON object. No markdown, no explanation.

Given the staples summary and aspiration answer below, extract the following signals:

1. staples_cuisines: array of cuisine types explicitly or implicitly mentioned in the staples list. Use standard labels: "Mexican", "Italian", "American", "Asian", "Mediterranean", "Indian", "Middle Eastern", "French", "Greek", "Other". Return [] if none detected.
2. staples_complexity: "simple" | "moderate" | "complex" — infer from the types of dishes named. Tacos and pasta = simple. Stir-fry and roasts = moderate. Braised dishes, multi-component meals = complex.
3. aspiration_specificity: "none" | "vague" | "specific" — "I want to cook more" = vague. "Thai green curry from scratch" = specific. No answer or skipped = none.
4. aspiration_ambition: "low" | "medium" | "high" — low = easy weeknight stretch. Medium = requires new technique or ingredient. High = technique-intensive or specialty cuisine.

User answers:
Staples (meals the family already eats): {{staples}}
Aspiration (something they want to try): {{aspiration}}`;

function buildParseFreeTextPrompt({ staples, aspiration }) {
  return PARSE_FREE_TEXT_PROMPT
    .replace('{{staples}}', staples || '(no answer)')
    .replace('{{aspiration}}', aspiration || '(no answer)');
}

module.exports = {
  PARSE_FREE_TEXT_PROMPT,
  buildParseFreeTextPrompt,
};
