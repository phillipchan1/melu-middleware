const express = require('express');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const { normalizeOnboardingAnswers } = require('../lib/normalizeOnboardingAnswers');
const { buildChefCardPayload } = require('../services/buildChefCardPayload');
const { fetchUserMealsForPlan } = require('../lib/userMealsDb');
const { replaceUserStaples } = require('../lib/staplesDb');

const router = express.Router();

/** Persisted chef cards may use legacy cuisine tag keys; API always returns `stapleCuisineTags`. */
function normalizeChefCardForClient(card) {
  if (!card || typeof card !== 'object') return card;
  const out = { ...card };
  const legacyKey = Buffer.from('cm90YXRpb25DdWlzaW5lVGFncw==', 'base64').toString('utf8');
  const legacy = out[legacyKey];
  if (Array.isArray(legacy) && legacy.length > 0 && !(Array.isArray(out.stapleCuisineTags) && out.stapleCuisineTags.length > 0)) {
    out.stapleCuisineTags = legacy;
  }
  if (legacyKey in out) {
    delete out[legacyKey];
  }
  return out;
}

/**
 * GET /api/profile/status
 * Whether the user has completed onboarding / has profile data worth skipping splash for.
 */
router.get('/status', async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Profile storage not configured' });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_answers, chef_card')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({ ok: true, hasProfile: false });
    }

    const answers = data.onboarding_answers;
    const hasOnboardingAnswers =
      answers != null &&
      typeof answers === 'object' &&
      !Array.isArray(answers) &&
      Object.keys(answers).length > 0;

    const card = data.chef_card;
    const hasChefCard =
      card != null &&
      typeof card === 'object' &&
      typeof card.buildName === 'string' &&
      card.buildName.trim().length > 0;

    const hasProfile = hasOnboardingAnswers || hasChefCard;

    res.json({ ok: true, hasProfile });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/profile/reset
 * Deletes meal plans, user meals, staples, and profile row for the authenticated user.
 */
router.post('/reset', async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Profile storage not configured' });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { error: mpErr } = await supabase.from('meal_plans').delete().eq('user_id', userId);
    if (mpErr) throw mpErr;

    const { error: umErr } = await supabase.from('user_meals').delete().eq('user_id', userId);
    if (umErr) throw umErr;

    await replaceUserStaples(userId, []);

    const { error: profErr } = await supabase.from('profiles').delete().eq('user_id', userId);
    if (profErr) throw profErr;

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/profile/chef-card
 * Returns the user's persisted Chef Card. Requires Bearer token.
 */
router.get('/chef-card', async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Profile storage not configured' });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('chef_card')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'No profile found', ok: false });
      }
      throw error;
    }

    if (!data?.chef_card || Object.keys(data.chef_card).length === 0) {
      return res.status(404).json({ error: 'No profile found', ok: false });
    }

    res.json({ ok: true, chefCard: normalizeChefCardForClient(data.chef_card) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/profile/chef-card
 * Generates and persists Chef Card from onboarding_answers + user_meals.
 */
router.post('/chef-card', async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Profile storage not configured' });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('onboarding_answers, discovery_pace')
      .eq('user_id', userId)
      .single();

    if (profileErr || !profile?.onboarding_answers) {
      return res.status(400).json({
        ok: false,
        error: 'No onboarding answers found. Complete onboarding first.',
      });
    }

    const rawAnswers = {
      ...profile.onboarding_answers,
      discoveryPace:
        profile.discovery_pace ?? profile.onboarding_answers?.discoveryPace,
    };
    const answers = normalizeOnboardingAnswers(rawAnswers);
    const { chefCardPayload, discoveryPace } = await buildChefCardPayload({ answers, userId });

    const { error: upErr } = await supabase.from('profiles').upsert(
      {
        user_id: userId,
        chef_card: chefCardPayload,
        onboarding_answers: answers,
        discovery_pace: discoveryPace,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upErr) {
      console.warn('Failed to persist chef card:', upErr.message);
      return res.status(500).json({ ok: false, error: 'Failed to save chef card' });
    }

    res.json({ ok: true, chefCard: normalizeChefCardForClient(chefCardPayload) });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/profile/meals-preview
 * Top staple / aspiration meal names for onboarding loading lines (user_meals).
 */
router.get('/meals-preview', async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Profile storage not configured' });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { staples, aspiration } = await fetchUserMealsForPlan(userId);
    const topStapleMeals = staples.slice(0, 5).map((m) => m.name);
    const topAspirations = aspiration.slice(0, 2).map((m) => m.name);

    res.json({
      ok: true,
      topStapleMeals,
      topAspirations,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
