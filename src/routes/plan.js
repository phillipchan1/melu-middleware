const express = require('express');
const { createJsonCompletion, isAzureConfigured } = require('../services/azureOpenAI');
const { buildPlanPrompt } = require('../prompts/planGeneration');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const { fetchUserStaples } = require('../lib/staplesDb');
const { fetchUserMealsForPlan, stapleToCatalogSlug } = require('../lib/userMealsDb');

const router = express.Router();

function getMondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

async function loadMealsByCatalogSlugs(staplesLike) {
  const slugs = [...new Set((staplesLike || []).map(stapleToCatalogSlug).filter(Boolean))];
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from('meals')
    .select('id, name, cuisine, catalog_slug')
    .in('catalog_slug', slugs);
  if (error) throw error;
  return data || [];
}

/** Normalize LLM JSON to client shape (camelCase). */
function normalizeMealsForClient(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((m) => ({
    day: m.day,
    mealId: m.meal_id ?? m.mealId,
    name: m.name,
    description: m.description,
    cookTime: m.cookTime,
    servings: m.servings,
    cuisine: m.cuisine,
    difficulty: m.difficulty,
    ingredients: m.ingredients,
    reasonTag: m.reason_tag ?? m.reasonTag,
    sourceType: m.source_type ?? m.sourceType,
  }));
}

router.post('/generate', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    if (!isAzureConfigured()) {
      return res.status(503).json({ error: 'Plan generation not configured' });
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('chef_card, onboarding_answers, discovery_pace')
      .eq('user_id', userId)
      .single();

    if (profileError || !profileRow) {
      return res.status(404).json({ error: 'Profile not found. Complete onboarding first.' });
    }

    let staplesFromDb = [];
    try {
      staplesFromDb = await fetchUserStaples(userId);
    } catch (e) {
      console.warn('fetchUserStaples:', e.message);
    }

    let rotation_meals = [];
    let aspiration_meals = [];
    try {
      const um = await fetchUserMealsForPlan(userId);
      rotation_meals = um.rotation;
      aspiration_meals = um.aspiration;
    } catch (e) {
      console.warn('fetchUserMealsForPlan:', e.message);
    }

    if (rotation_meals.length === 0 && staplesFromDb.length) {
      try {
        rotation_meals = await loadMealsByCatalogSlugs(staplesFromDb);
      } catch (e) {
        console.warn('loadMealsByCatalogSlugs rotation:', e.message);
      }
    }

    const answers = profileRow.onboarding_answers || {};
    const aspirationsClient = Array.isArray(answers.aspirations) ? answers.aspirations : [];
    if (aspiration_meals.length === 0 && aspirationsClient.length) {
      try {
        aspiration_meals = await loadMealsByCatalogSlugs(aspirationsClient);
      } catch (e) {
        console.warn('loadMealsByCatalogSlugs aspiration:', e.message);
      }
    }

    const profile = {
      chef_card: profileRow.chef_card || {},
      onboarding_answers: answers,
      discovery_pace: profileRow.discovery_pace,
      rotation_meals,
      aspiration_meals,
      staples: staplesFromDb,
    };

    const { system, user } = buildPlanPrompt(profile);

    let raw;
    let meals;

    const tryParse = (str) => {
      const parsed = JSON.parse(str);
      const arr = parsed.meals || parsed;
      if (!Array.isArray(arr) || arr.length !== 7) {
        throw new Error('Invalid meals array');
      }
      return arr;
    };

    try {
      raw = await createJsonCompletion(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        0.8
      );
      meals = tryParse(raw);
    } catch (parseErr) {
      try {
        raw = await createJsonCompletion(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          0.5
        );
        meals = tryParse(raw);
      } catch (retryErr) {
        console.error('Plan generation JSON parse failed:', parseErr.message, retryErr.message);
        return res.status(500).json({
          error: 'Failed to generate plan',
          details: 'Could not parse AI response. Please try again.',
        });
      }
    }

    const weekStart = getMondayOfWeek(new Date());

    await supabase
      .from('meal_plans')
      .delete()
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('status', 'pending');

    const { data: insertRow, error: insertError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: userId,
        status: 'pending',
        meals,
        week_start: weekStart,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('meal_plans insert failed:', insertError);
      return res.status(500).json({ error: 'Failed to save plan' });
    }

    res.json({
      success: true,
      plan: {
        id: insertRow.id,
        weekStart,
        meals: normalizeMealsForClient(meals),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
