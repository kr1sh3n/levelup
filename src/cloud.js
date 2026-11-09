import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when not configured: the app then runs in local-only mode (no logins).
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

// One JSONB document per user; row-level security restricts each row to its owner.
const TABLE = "user_state";

export async function fetchRemoteState(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { data: data.data, updatedAt: Date.parse(data.updated_at) } : null;
}

export async function pushRemoteState(userId, state, updatedAt) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data: state, updated_at: new Date(updatedAt).toISOString() });
  if (error) throw error;
}
