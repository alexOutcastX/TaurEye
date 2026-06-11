import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Configured at build time. Empty in local/dev → the app runs in offline/guest
// mode (no cloud accounts or sync) and "lights up" once these are provided.
const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      // PKCE: required for native OAuth deep links (the appUrlOpen handler
      // exchanges the ?code= for a session); on web detectSessionInUrl does
      // the same exchange automatically, so both platforms share one flow.
      auth: { persistSession: true, autoRefreshToken: true, flowType: "pkce" },
    })
  : null;
