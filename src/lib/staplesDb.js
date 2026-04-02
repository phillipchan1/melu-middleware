const { supabase } = require('./supabase');

function isUuidLike(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function clientStapleToRow(userId, item, sortOrder) {
  const fromExplicit =
    typeof item.libraryMealId === 'string' && item.libraryMealId.trim()
      ? item.libraryMealId.trim()
      : null;
  const libraryMealId =
    item.custom ? null : fromExplicit || (item.id && !isUuidLike(item.id) ? item.id : null);
  return {
    user_id: userId,
    name: item.name,
    cuisine: item.cuisine || 'Other',
    library_meal_id: libraryMealId,
    complexity_tier: item.complexityTier || null,
    is_custom: !!item.custom,
    sort_order: sortOrder,
  };
}

function dbRowToClientStaple(row) {
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    complexityTier: row.complexity_tier || undefined,
    custom: row.is_custom,
  };
}

/**
 * Replace all staples for a user (e.g. onboarding submit or PUT /api/staples).
 */
async function replaceUserStaples(userId, staples) {
  if (!supabase) return;
  const { error: delErr } = await supabase.from('staples').delete().eq('user_id', userId);
  if (delErr) throw delErr;
  if (!Array.isArray(staples) || staples.length === 0) return;
  const rows = staples.map((s, i) => clientStapleToRow(userId, s, i));
  const { error: insErr } = await supabase.from('staples').insert(rows);
  if (insErr) throw insErr;
}

async function fetchUserStaples(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('staples')
    .select('id, name, cuisine, library_meal_id, complexity_tier, is_custom, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    complexityTier: row.complexity_tier || undefined,
    custom: row.is_custom,
    libraryMealId: row.library_meal_id || undefined,
  }));
}

module.exports = {
  replaceUserStaples,
  fetchUserStaples,
  dbRowToClientStaple,
};
