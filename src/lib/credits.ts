// Server-backed credit adapter (the activation layer for the economy).
//
// `economy.ts` is the local/guest engine (localStorage, used while the economy
// is OFF or there is no cloud account). When you flip ECONOMY_ENABLED on AND a
// Supabase project is configured, the wallet must live server-side so a balance
// can't be edited in the browser. These thin async helpers wrap the SECURITY
// DEFINER RPCs in supabase/credits.sql; wire them into the Wallet/Chart/Screener
// flows as the activation step (see ECONOMY.md → Phase A/B).
//
// All functions degrade safely to "unlocked / no-op" when Supabase is not
// configured, so importing this module never breaks the offline build.
import { isSupabaseConfigured, supabase } from "./supabase";

export const creditsCloud = isSupabaseConfigured;

// ---- change notification (so the badge/wallet refresh after a mutation) ----
type Listener = () => void;
const listeners = new Set<Listener>();
export function onCreditsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function emitCreditsChange() {
  listeners.forEach((l) => l());
}

/** Current server balance for the signed-in user (0 when offline/guest). */
export async function myBalance(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("my_balance");
  if (error) return 0;
  return (data as number) ?? 0;
}

/**
 * Spend credits for a premium action. Returns the new balance on success.
 * Offline/guest → always allowed (the local economy gates instead).
 * NOTE: the AI sink is charged by the ai-analysis Edge Function, not here —
 * don't double-charge "ai_analysis" from the client once cloud credits are on.
 */
export async function spendCredits(
  reason: string,
  cost: number,
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (!supabase) return { ok: true };
  const { data, error } = await supabase.rpc("spend_credits", {
    p_reason: reason,
    p_cost: cost,
  });
  if (error) {
    return { ok: false, error: error.message.includes("insufficient_credits") ? "insufficient" : error.message };
  }
  emitCreditsChange();
  return { ok: true, balance: data as number };
}

/** Claim the once-per-day free credits (server-enforced). */
export async function claimDaily(
  amount: number,
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (!supabase) return { ok: false, error: "offline" };
  const { data, error } = await supabase.rpc("claim_daily", { p_amount: amount });
  if (error) {
    return { ok: false, error: error.message.includes("already_claimed") ? "already_claimed" : error.message };
  }
  emitCreditsChange();
  return { ok: true, balance: data as number };
}

export type LedgerRow = { id: string; ts: string; delta: number; reason: string };

/** Newest-first credit history for the signed-in user (RLS-scoped). */
export async function listLedger(limit = 50): Promise<LedgerRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, created_at, delta, reason")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id as string, ts: r.created_at as string, delta: r.delta as number, reason: r.reason as string }));
}

/** Purchasable credit packs (server catalog; falls back to empty offline). */
export async function listProducts(): Promise<
  { id: string; credits: number; price_inr: number }[]
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("credit_products")
    .select("id, credits, price_inr")
    .eq("active", true)
    .order("sort");
  if (error) return [];
  return data as { id: string; credits: number; price_inr: number }[];
}
