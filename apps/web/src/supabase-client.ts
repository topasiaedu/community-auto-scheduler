/**
 * Browser Supabase client (lazy). Returns null when Vite env is unset so `/health` can still load in partial setups.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Creates (once) a Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, or returns null if either is missing.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const urlRaw = import.meta.env.VITE_SUPABASE_URL;
  const anonRaw = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = typeof urlRaw === "string" ? urlRaw.trim() : "";
  const anon = typeof anonRaw === "string" ? anonRaw.trim() : "";
  if (url.length === 0 || anon.length === 0) {
    cached = null;
    return null;
  }
  cached = createClient(url, anon);
  return cached;
}
