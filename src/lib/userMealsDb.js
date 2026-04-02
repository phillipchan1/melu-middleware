const { supabase } = require('./supabase');

function isUuidLike(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Resolve catalog slug from client staple (matches staplesDb library_meal_id logic). */
function stapleToCatalogSlug(item) {
  if (!item || item.custom) return null;
  const fromExplicit =
    typeof item.libraryMealId === 'string' && item.libraryMealId.trim()
      ? item.libraryMealId.trim()
      : null;
  return fromExplicit || (item.id && !isUuidLike(item.id) ? item.id : null);
}

/**
 * Replace onboarding-sourced user_meals rows with rotation + aspiration selections.
 * // SPEC GAP: staples without a matching public.meals.catalog_slug row are skipped (custom meals).
 */
async function replaceOnboardingUserMeals(userId, rotationStaples, aspirationStaples) {
  if (!supabase) return;

  const { error: delErr } = await supabase
    .from('user_meals')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'onboarding');
  if (delErr) throw delErr;

  const rotSlugs = (rotationStaples || []).map(stapleToCatalogSlug).filter(Boolean);
  const aspSlugs = (aspirationStaples || []).map(stapleToCatalogSlug).filter(Boolean);
  const allSlugs = [...new Set([...rotSlugs, ...aspSlugs])];
  if (allSlugs.length === 0) return;

  const { data: mealRows, error: qErr } = await supabase
    .from('meals')
    .select('id, catalog_slug')
    .in('catalog_slug', allSlugs);
  if (qErr) throw qErr;

  const slugToId = new Map((mealRows || []).map((r) => [r.catalog_slug, r.id]));

  const rows = [];
  for (const slug of rotSlugs) {
    const mealId = slugToId.get(slug);
    if (!mealId) continue;
    rows.push({
      user_id: userId,
      meal_id: mealId,
      type: 'rotation',
      source: 'onboarding',
    });
  }
  for (const slug of aspSlugs) {
    const mealId = slugToId.get(slug);
    if (!mealId) continue;
    rows.push({
      user_id: userId,
      meal_id: mealId,
      type: 'aspiration',
      source: 'onboarding',
    });
  }
  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from('user_meals').insert(rows);
  if (insErr) throw insErr;
}

/**
 * @returns {{ rotation: Array<{id: string, name: string, cuisine: string, catalog_slug: string, added_at: string}>, aspiration: Array<...> }}
 */
async function fetchUserMealsForPlan(userId) {
  if (!supabase) return { rotation: [], aspiration: [] };

  const { data: umRows, error: umErr } = await supabase
    .from('user_meals')
    .select('meal_id, type, added_at')
    .eq('user_id', userId);

  if (umErr) throw umErr;
  if (!umRows || umRows.length === 0) return { rotation: [], aspiration: [] };

  const ids = [...new Set(umRows.map((r) => r.meal_id).filter(Boolean))];
  const { data: mealRows, error: mErr } = await supabase
    .from('meals')
    .select('id, name, cuisine, catalog_slug')
    .in('id', ids);
  if (mErr) throw mErr;

  const idToMeal = new Map((mealRows || []).map((m) => [m.id, m]));

  const rotation = [];
  const aspiration = [];
  for (const row of umRows) {
    const m = idToMeal.get(row.meal_id);
    if (!m) continue;
    const entry = {
      id: m.id,
      name: m.name,
      cuisine: m.cuisine,
      catalog_slug: m.catalog_slug,
      added_at: row.added_at,
    };
    if (row.type === 'rotation') rotation.push(entry);
    else if (row.type === 'aspiration') aspiration.push(entry);
  }

  const byAdded = (a, b) => String(a.added_at || '').localeCompare(String(b.added_at || ''));
  rotation.sort(byAdded);
  aspiration.sort(byAdded);

  return { rotation, aspiration };
}

module.exports = {
  replaceOnboardingUserMeals,
  stapleToCatalogSlug,
  fetchUserMealsForPlan,
};
