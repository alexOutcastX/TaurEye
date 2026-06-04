// Refer & Earn — PLACEHOLDER DATA for team review.
//
// This module fabricates a referral code, share link, reward tiers, and a
// sample list of invited friends so the UI can be reviewed end-to-end before
// the real backend (code issuance + redemption verification) is wired up.
// Nothing here is persisted or verified — swap these stubs for API calls once
// the server side is ready.

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

// Reward amounts shown to the user (placeholder).
export const REWARD_PER_REFERRAL = 50;
export const REWARD_FOR_FRIEND = 25;

// A fixed placeholder code/link so screenshots are stable for the team.
const PLACEHOLDER_CODE = "TAUR-AX92QK";
const PLACEHOLDER_LINK = `https://taureye.app/r/${PLACEHOLDER_CODE}`;

// Sample invitees: a mix of joined + pending so both states are visible.
const PLACEHOLDER_INVITED: Referral[] = [
  { id: "r1", name: "Aarav Sharma", joinedAt: "2026-05-28T10:12:00+05:30", status: "joined", reward: REWARD_PER_REFERRAL },
  { id: "r2", name: "Priya Menon", joinedAt: "2026-05-30T18:45:00+05:30", status: "joined", reward: REWARD_PER_REFERRAL },
  { id: "r3", name: "Rohan Gupta", joinedAt: "2026-06-01T09:05:00+05:30", status: "joined", reward: REWARD_PER_REFERRAL },
  { id: "r4", name: "Neha Iyer", joinedAt: null, status: "pending", reward: 0 },
  { id: "r5", name: "Karthik Rao", joinedAt: null, status: "pending", reward: 0 },
];

export function getReferralProgram(): ReferralProgram {
  return {
    code: PLACEHOLDER_CODE,
    link: PLACEHOLDER_LINK,
    rewardPerReferral: REWARD_PER_REFERRAL,
    rewardForFriend: REWARD_FOR_FRIEND,
    invited: PLACEHOLDER_INVITED,
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
  const text = `Join me on TaurEye — India's stock screener. Use my code ${p.code} to get ${p.rewardForFriend} free credits.`;
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
