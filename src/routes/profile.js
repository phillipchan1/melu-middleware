const express = require('express');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const { normalizeOnboardingAnswers } = require('../lib/normalizeOnboardingAnswers');
const { buildChefCardPayload } = require('../services/buildChefCardPayload');
const { fetchUserMealsForPlan } = require('../lib/userMealsDb');

const router = express.Router();

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

    res.json({ ok: true, chefCard: data.chef_card });
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

    res.json({ ok: true, chefCard: chefCardPayload });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/profile/meals-preview
 * Top rotation / aspiration meal names for onboarding loading lines (user_meals).
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

    const { rotation, aspiration } = await fetchUserMealsForPlan(userId);
    const topRotationMeals = rotation.slice(0, 3).map((m) => m.name);
    const topAspirations = aspiration.slice(0, 2).map((m) => m.name);

    res.json({
      ok: true,
      topRotationMeals,
      topAspirations,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
