const express = require('express');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const {
  normalizeOnboardingAnswers,
  getStaplesList,
  getAspirationsList,
} = require('../lib/normalizeOnboardingAnswers');
const { replaceUserStaples } = require('../lib/staplesDb');
const { replaceOnboardingUserMeals } = require('../lib/userMealsDb');
const { parseDiscoveryPace } = require('../services/buildChefCardPayload');

const router = express.Router();

router.post('/submit', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const answers = normalizeOnboardingAnswers(req.body || {});
    const staplesList = getStaplesList(answers);
    const aspirationsList = getAspirationsList(answers);
    const discoveryPace = parseDiscoveryPace(answers);

    // SPEC GAP: if Supabase is disabled, client still gets ok:true but POST /profile/chef-card will fail without persisted onboarding_answers.
    if (isSupabaseConfigured && supabase) {
      const { error: dbError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_answers: answers,
          discovery_pace: discoveryPace,
          chef_card: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (dbError) {
        console.warn('Failed to persist onboarding profile:', dbError.message);
        return res.status(500).json({
          ok: false,
          error: 'Failed to save your profile. Please try again.',
        });
      }
      try {
        await replaceUserStaples(userId, staplesList);
      } catch (syncErr) {
        console.warn('Failed to sync staples:', syncErr.message);
      }
      try {
        await replaceOnboardingUserMeals(userId, staplesList, aspirationsList);
      } catch (umErr) {
        console.warn('Failed to sync user_meals:', umErr.message);
      }
    }

    res.json({
      ok: true,
      profile: {
        ...answers,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
