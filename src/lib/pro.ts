// TaurEye Pro — subscription scaffolding (DORMANT until Razorpay subscriptions
// are wired). The entitlement check is real (server-side `is_pro()` RPC over
// the subscriptions table); purchasing isn't. When payments land, only the
// checkout flow is added — every gate that calls isPro() just starts working.

import { isSupabaseConfigured, supabase } from "./supabase";

/** Master switch for showing purchasable Pro UI. Keep false until checkout works. */
export const PRO_ENABLED = false;

/** Pricing shown in the (dormant) Pro card. Strategy: undercut the ₹2.4k–6k field. */
export const PRO_PRICING = {
  yearlyInr: 999,
  monthlyInr: 149,
} as const;

export const PRO_BENEFITS = [
  "No ads",
  "Unlimited screens & watchlists",
  "EOD price alerts with push",
  "Generous AI analysis & reports",
] as const;

/** Server-side entitlement check. False for guests / offline / no sub. */
export async function isPro(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  const { data, error } = await supabase.rpc("is_pro");
  return !error && data === true;
}
