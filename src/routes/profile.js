const express = require('express');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');

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

module.exports = router;
