const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = Boolean(supabaseUrl && supabaseServiceKey);

const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Extract and verify JWT from Authorization header.
 * Returns { userId } or null if invalid/missing.
 */
async function getUserIdFromRequest(req) {
  if (!supabase) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user?.id) return null;
    return user.id;
  } catch {
    return null;
  }
}

module.exports = {
  supabase,
  isSupabaseConfigured: isConfigured,
  getUserIdFromRequest,
};
