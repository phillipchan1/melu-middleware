const express = require('express');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const { replaceUserStaples, fetchUserStaples } = require('../lib/staplesDb');

const router = express.Router();

function isValidStapleItem(m) {
  return (
    m &&
    typeof m === 'object' &&
    typeof m.name === 'string' &&
    m.name.trim().length > 0 &&
    typeof m.cuisine === 'string' &&
    m.cuisine.trim().length > 0
  );
}

router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isSupabaseConfigured || !supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const staples = await fetchUserStaples(userId);
    res.json({ ok: true, staples });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isSupabaseConfigured || !supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const body = req.body || {};
    const staples = body.staples;
    if (!Array.isArray(staples)) {
      return res.status(400).json({ error: 'Expected { staples: array }' });
    }
    for (const m of staples) {
      if (!isValidStapleItem(m)) {
        return res.status(400).json({ error: 'Invalid staple item' });
      }
    }
    await replaceUserStaples(userId, staples);
    const refreshed = await fetchUserStaples(userId);
    res.json({ ok: true, staples: refreshed });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
