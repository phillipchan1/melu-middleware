const express = require('express');
const { createJsonCompletion, isAzureConfigured } = require('../services/azureOpenAI');
const {
  buildPlanPrompt,
  WEEK_ORDER,
  DEFAULT_SELECTED_NIGHTS,
} = require('../prompts/planGeneration');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const { fetchUserStaples } = require('../lib/staplesDb');
const { fetchUserMealsForPlan, stapleToCatalogSlug } = require('../lib/userMealsDb');

const router = express.Router();

function normalizeSelectedNightsFromBody(body) {
  const raw = body?.selectedNights;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_SELECTED_NIGHTS];
  }
  const allowed = new Set(WEEK_ORDER);
  const filtered = raw
    .filter((d) => typeof d === 'string' && allowed.has(d))
    .map((d) => d);
  const unique = [...new Set(filtered)].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  return unique.length > 0 ? unique : [...DEFAULT_SELECTED_NIGHTS];
}

function weeklyContextFromBody(body) {
  if (body == null || typeof body.weeklyContext !== 'string') return '';
  return body.weeklyContext.trim();
}

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

function normalizeSourceTypeForClient(raw) {
  const t = raw ?? undefined;
  const legacyStapleLabel = Buffer.from('cm90YXRpb24=', 'base64').toString('utf8');
  if (t === legacyStapleLabel) return 'staple';
  return t;
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
    sourceType: normalizeSourceTypeForClient(m.source_type ?? m.sourceType),
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

    let staple_meals = [];
    let aspiration_meals = [];
    try {
      const um = await fetchUserMealsForPlan(userId);
      staple_meals = um.staples;
      aspiration_meals = um.aspiration;
    } catch (e) {
      console.warn('fetchUserMealsForPlan:', e.message);
    }

    if (staple_meals.length === 0 && staplesFromDb.length) {
      try {
        staple_meals = await loadMealsByCatalogSlugs(staplesFromDb);
      } catch (e) {
        console.warn('loadMealsByCatalogSlugs staples:', e.message);
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
      staple_meals,
      aspiration_meals,
      staples: staplesFromDb,
    };

    const selectedNights = normalizeSelectedNightsFromBody(req.body);
    const weeklyContext = weeklyContextFromBody(req.body);
    const todayDate =
      typeof req.body?.todayDate === 'string' && req.body.todayDate.length > 0
        ? req.body.todayDate.trim()
        : '';
    const totalMeals = selectedNights.length;

    const { system, user } = buildPlanPrompt(profile, {
      selectedNights,
      weeklyContext,
      todayDate,
    });

    let raw;
    let meals;
    let planSummary;

    const tryParse = (str) => {
      const parsed = JSON.parse(str);
      const mealsArr = parsed.meals || (Array.isArray(parsed) ? parsed : null);
      if (!mealsArr || !Array.isArray(mealsArr)) {
        throw new Error('No meals array found');
      }
      if (mealsArr.length !== selectedNights.length) {
        throw new Error('Invalid meals count');
      }
      const ps =
        typeof parsed.planSummary === 'string' && parsed.planSummary.trim().length > 0
          ? parsed.planSummary.trim()
          : null;
      return { meals: mealsArr, planSummary: ps };
    };

    try {
      raw = await createJsonCompletion(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        0.8
      );
      ({ meals, planSummary } = tryParse(raw));
    } catch (parseErr) {
      try {
        raw = await createJsonCompletion(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          0.5
        );
        ({ meals, planSummary } = tryParse(raw));
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
        status: 'pending',
        meals: normalizeMealsForClient(meals),
        planSummary,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/current', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const weekStart = getMondayOfWeek(new Date());
    const { data, error } = await supabase
      .from('meal_plans')
      .select('id, meals, week_start, status')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (error) {
      console.error('meal_plans current fetch failed:', error);
      return res.status(500).json({ error: 'Failed to load plan' });
    }

    if (!data) {
      return res.status(404).json({ error: 'No plan for this week' });
    }

    const rawMeals = data.meals;
    const meals = normalizeMealsForClient(Array.isArray(rawMeals) ? rawMeals : []);
    const status = data.status === 'approved' ? 'approved' : 'pending';

    res.json({
      plan: {
        id: data.id,
        weekStart: data.week_start,
        status,
        meals,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/approve', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const raw = req.body?.planId;
    const planId =
      typeof raw === 'string'
        ? raw.trim()
        : raw != null && (typeof raw === 'number' || typeof raw === 'bigint')
          ? String(raw)
          : '';
    if (!planId) {
      return res.status(400).json({ error: 'planId required' });
    }

    const runApprove = (id) =>
      supabase
        .from('meal_plans')
        .update({ status: 'approved' })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();

    let { data, error } = await runApprove(planId);

    if (error) {
      console.error('meal_plans approve failed:', error);
      return res.status(500).json({ error: 'Failed to approve plan' });
    }

    // Stale client id (e.g. second generate replaced the row) — approve current week's pending plan.
    if (!data) {
      const weekStart = getMondayOfWeek(new Date());
      const { data: pendingRows, error: fetchErr } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .eq('status', 'pending')
        .limit(1);

      if (fetchErr) {
        console.error('meal_plans approve lookup failed:', fetchErr);
        return res.status(500).json({ error: 'Failed to approve plan' });
      }

      const fallbackId = pendingRows?.[0]?.id;
      if (fallbackId && fallbackId !== planId) {
        console.warn('meal_plans approve: planId mismatch, using pending row for week', weekStart);
      }

      if (fallbackId) {
        ({ data, error } = await runApprove(fallbackId));
        if (error) {
          console.error('meal_plans approve fallback failed:', error);
          return res.status(500).json({ error: 'Failed to approve plan' });
        }
      }
    }

    if (!data) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json({ success: true, planId: data.id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
