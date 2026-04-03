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

function collectSlugsFromItems(items) {
  const out = [];
  for (const item of items || []) {
    const s = stapleToCatalogSlug(item);
    if (s) out.push(s);
  }
  return out;
}

/** UUID meal ids when the client only has DB meal id (no catalog slug). */
function collectUuidIdsFromItems(items) {
  const out = [];
  for (const item of items || []) {
    if (!item || item.custom) continue;
    if (stapleToCatalogSlug(item)) continue;
    if (item.id && isUuidLike(item.id)) out.push(item.id);
  }
  return [...new Set(out)];
}

function resolveMealIdForItem(item, slugToId, validUuidSet) {
  if (!item || item.custom) return null;
  const slug = stapleToCatalogSlug(item);
  if (slug) {
    return slugToId.get(slug) || null;
  }
  if (item.id && isUuidLike(item.id) && validUuidSet.has(item.id)) {
    return item.id;
  }
  return null;
}

/**
 * Replace onboarding-sourced user_meals rows with staple + aspiration selections.
 * Resolves meals by catalog slug and by UUID id when the client sends library meal ids only.
 */
async function replaceOnboardingUserMeals(userId, onboardingStaples, aspirationStaples) {
  if (!supabase) return;

  const { error: delErr } = await supabase
    .from('user_meals')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'onboarding');
  if (delErr) throw delErr;

  const staples = onboardingStaples || [];
  const aspirations = aspirationStaples || [];

  const stapleSlugs = collectSlugsFromItems(staples);
  const aspSlugs = collectSlugsFromItems(aspirations);
  const allSlugs = [...new Set([...stapleSlugs, ...aspSlugs])];

  const uuidFromStaples = collectUuidIdsFromItems(staples);
  const uuidFromAsp = collectUuidIdsFromItems(aspirations);
  const allUuids = [...new Set([...uuidFromStaples, ...uuidFromAsp])];

  if (allSlugs.length === 0 && allUuids.length === 0) return;

  const slugToId = new Map();
  if (allSlugs.length > 0) {
    const { data: mealRows, error: qErr } = await supabase
      .from('meals')
      .select('id, catalog_slug')
      .in('catalog_slug', allSlugs);
    if (qErr) throw qErr;
    for (const r of mealRows || []) {
      slugToId.set(r.catalog_slug, r.id);
    }
  }

  const validUuidSet = new Set();
  if (allUuids.length > 0) {
    const { data: uuidRows, error: uErr } = await supabase.from('meals').select('id').in('id', allUuids);
    if (uErr) throw uErr;
    for (const r of uuidRows || []) {
      validUuidSet.add(r.id);
    }
  }

  const seen = new Set();
  const rows = [];

  function pushRow(type, mealId) {
    const k = `${type}:${mealId}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push({
      user_id: userId,
      meal_id: mealId,
      type,
      source: 'onboarding',
    });
  }

  for (const item of staples) {
    const mid = resolveMealIdForItem(item, slugToId, validUuidSet);
    if (mid) pushRow('staple', mid);
  }
  for (const item of aspirations) {
    const mid = resolveMealIdForItem(item, slugToId, validUuidSet);
    if (mid) pushRow('aspiration', mid);
  }

  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from('user_meals').insert(rows);
  if (insErr) throw insErr;
}

/**
 * @returns {{ staples: Array<{id: string, name: string, cuisine: string, catalog_slug: string, added_at: string}>, aspiration: Array<...> }}
 */
async function fetchUserMealsForPlan(userId) {
  if (!supabase) return { staples: [], aspiration: [] };

  const { data: umRows, error: umErr } = await supabase
    .from('user_meals')
    .select('meal_id, type, added_at')
    .eq('user_id', userId);

  if (umErr) throw umErr;
  if (!umRows || umRows.length === 0) return { staples: [], aspiration: [] };

  const ids = [...new Set(umRows.map((r) => r.meal_id).filter(Boolean))];
  const { data: mealRows, error: mErr } = await supabase
    .from('meals')
    .select('id, name, cuisine, catalog_slug')
    .in('id', ids);
  if (mErr) throw mErr;

  const idToMeal = new Map((mealRows || []).map((m) => [m.id, m]));

  const staples = [];
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
    if (row.type === 'staple') staples.push(entry);
    else if (row.type === 'aspiration') aspiration.push(entry);
  }

  const byAdded = (a, b) => String(a.added_at || '').localeCompare(String(b.added_at || ''));
  staples.sort(byAdded);
  aspiration.sort(byAdded);

  return { staples, aspiration };
}

module.exports = {
  replaceOnboardingUserMeals,
  stapleToCatalogSlug,
  fetchUserMealsForPlan,
};
