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

// ── Profile and consent ─────────────────────────────────────────────────────
// A separate small row from the save blob, so the operator can see who signed
// up and what they agreed to without loading everybody's training history.

export const CONSENT_TEXT =
  "I understand that the data I log here — my workouts, meals, goals and body stats — is stored in the cloud " +
  "and can be read by the person who runs this app.";

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, consented_at, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Written once at sign-up. `consent_text` records the exact wording accepted,
// so a later change of wording cannot rewrite what someone agreed to.
export async function recordConsent(userId, displayName) {
  const { error } = await supabase.from("profiles").upsert({
    user_id: userId,
    display_name: displayName || null,
    consented_at: new Date().toISOString(),
    consent_text: CONSENT_TEXT,
  });
  if (error) throw error;
}

export async function saveDisplayName(userId, displayName) {
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, display_name: displayName || null });
  if (error) throw error;
}

// Removes the save, the profile and the login itself. The database function
// only ever deletes the caller's own account.
export async function deleteMyAccount() {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  await supabase.auth.signOut();
}
