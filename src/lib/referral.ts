// Refer & Earn — real backend (Supabase) with a placeholder fallback so the
// page still renders in local/guest preview.
//
// Server side (supabase/referrals.sql):
//   claim_referral(code) — one-time redemption; grants BOTH sides' credits
//   my_referrals()       — who joined with my code (display name + reward)
// The user's own code lives on their profile row (created at signup).

import { isSupabaseConfigured, supabase } from "./supabase";
import { REWARDS } from "./economy";
import { emitCreditsChange } from "./credits";

export interface Referral {
  id: string;
  name: string;
  joinedAt: string | null; // ISO when they signed up, null while pending
  status: "joined" | "pending";
  reward: number; // credits granted to you for this referral
}

export interface ReferralProgram {
  code: string;
  link: string;
  rewardPerReferral: number; // credits you get when a friend joins
  rewardForFriend: number; // credits the friend gets on signup
  invited: Referral[];
}

export const REWARD_PER_REFERRAL = REWARDS.referrer;
export const REWARD_FOR_FRIEND = REWARDS.referee;

// The public, shareable site URL for invite links. In the native app the WebView
// origin is https://localhost (not shareable), so prefer the build-time
// VITE_PUBLIC_URL and fall back to the live site when the origin is local.
function siteBase(): string {
  const env = (import.meta.env.VITE_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  const o = typeof window !== "undefined" ? window.location.origin : "";
  if (!o || /^(https?:\/\/localhost|capacitor:|ionic:|file:)/i.test(o)) {
    return "http://161.118.174.177"; // the live web deployment (set VITE_PUBLIC_URL to a domain later)
  }
  return o;
}

// ---- pending invite code (captured from /login?ref=CODE, claimed post-auth) ----
const REF_KEY = "taureye.referral.pending.v1";

export function storeRefCode(code: string) {
  if (code.trim()) localStorage.setItem(REF_KEY, code.trim());
}
export function pendingRefCode(): string | null {
  return localStorage.getItem(REF_KEY);
}
export function clearRefCode() {
  localStorage.removeItem(REF_KEY);
}

export type ClaimResult = "claimed" | "already_referred" | "invalid_code" | "self_referral" | "failed";

/** Redeem a referral code for the signed-in user (server-validated, one-time). */
export async function claimReferral(code: string): Promise<ClaimResult> {
  if (!supabase) return "failed";
  const { error } = await supabase.rpc("claim_referral", { p_code: code });
  if (!error) {
    emitCreditsChange();
    return "claimed";
  }
  const m = error.message || "";
  if (m.includes("already_referred")) return "already_referred";
  if (m.includes("invalid_code")) return "invalid_code";
  if (m.includes("self_referral")) return "self_referral";
  return "failed";
}

/** Auto-claim a code captured from an invite link, once, after sign-in. */
export async function claimPendingReferral(): Promise<void> {
  const code = pendingRefCode();
  if (!code || !supabase) return;
  await claimReferral(code); // outcome doesn't matter — never retry a bad code
  clearRefCode();
}

// ---- program data ----
const PLACEHOLDER: ReferralProgram = {
  code: "TAUR-PREVIEW",
  link: "https://taureye.app/login?ref=TAUR-PREVIEW",
  rewardPerReferral: REWARD_PER_REFERRAL,
  rewardForFriend: REWARD_FOR_FRIEND,
  invited: [],
};

/** Load the signed-in user's real program (code, link, invited list). */
export async function getReferralProgram(): Promise<ReferralProgram> {
  if (!isSupabaseConfigured || !supabase) return PLACEHOLDER;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return PLACEHOLDER;

  const { data: prof } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", auth.user.id)
    .maybeSingle();
  const code = (prof?.referral_code as string) || "";

  const { data: rows } = await supabase.rpc("my_referrals");
  const invited: Referral[] = ((rows as { display_name: string; joined_at: string; reward: number }[]) ?? []).map(
    (r, i) => ({
      id: `r${i}`,
      name: r.display_name,
      joinedAt: r.joined_at,
      status: "joined",
      reward: r.reward,
    }),
  );

  return {
    code: code || PLACEHOLDER.code,
    link: `${siteBase()}/i/${encodeURIComponent(code || PLACEHOLDER.code)}`,
    rewardPerReferral: REWARD_PER_REFERRAL,
    rewardForFriend: REWARD_FOR_FRIEND,
    invited,
  };
}

// Derived totals for the summary cards.
export function referralStats(p: ReferralProgram) {
  const joined = p.invited.filter((r) => r.status === "joined");
  const pending = p.invited.filter((r) => r.status === "pending");
  const earned = joined.reduce((sum, r) => sum + r.reward, 0);
  return {
    joinedCount: joined.length,
    pendingCount: pending.length,
    creditsEarned: earned,
  };
}

// Share via the native share sheet when available (mobile/Capacitor WebView,
// or browsers that support the Web Share API); otherwise copy to clipboard.
// Returns the action taken so the UI can show the right feedback.
export async function shareReferral(p: ReferralProgram): Promise<"shared" | "copied" | "failed"> {
  const text = `Join me on TaurEye, India's stock screener — get ${p.rewardForFriend} free credits when you sign up:`;

  // Native (Capacitor): open the OS share sheet via the Share plugin. The Android
  // WebView doesn't implement navigator.share, so this is required for the app.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: "TaurEye", text, url: p.link, dialogTitle: "Share invite" });
      return "shared";
    }
  } catch {
    // plugin missing / user dismissed — fall through
  }

  // Web (mobile browsers, iOS WKWebView): Web Share API.
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: "TaurEye", text, url: p.link });
      return "shared";
    } catch {
      // user dismissed or share failed — fall through to clipboard
    }
  }
  return copyToClipboard(`${text} ${p.link}`);
}

export async function copyToClipboard(value: string): Promise<"copied" | "failed"> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return "copied";
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return "copied";
  } catch {
    return "failed";
  }
}
