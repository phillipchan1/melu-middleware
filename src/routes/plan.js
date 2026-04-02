const express = require('express');
const { createJsonCompletion, isAzureConfigured } = require('../services/azureOpenAI');
const { buildPlanPrompt } = require('../prompts/planGeneration');
const { supabase, isSupabaseConfigured, getUserIdFromRequest } = require('../lib/supabase');
const { fetchUserStaples } = require('../lib/staplesDb');

const router = express.Router();

function getMondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
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
      .select('chef_card, onboarding_answers')
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

    const profile = {
      chef_card: profileRow.chef_card || {},
      onboarding_answers: profileRow.onboarding_answers || {},
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
        meals,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
