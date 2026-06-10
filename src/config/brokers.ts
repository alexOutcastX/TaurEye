// Broker affiliate partners (Phase 1 monetization — highest margin, no infra).
//
// HOW TO GO LIVE: paste your referral/partner signup link into `url` for each
// broker you've joined. Entries with an empty `url` are hidden, so this ships
// safely with nothing live until you fill links in. No rebuild logic needed —
// it's a plain web change that deploys with the next push.
//
// SEBI note: these promote opening a demat account (a brokerage signup), NOT
// buying/selling any security. Keep blurbs factual; the CTA carries a disclosure.

export type Broker = {
  id: string;
  name: string;
  /** Your affiliate/partner signup URL. Empty = hidden. */
  url: string;
  /** Short factual blurb (no advice, no returns claims). */
  blurb: string;
};

export const BROKERS: Broker[] = [
  { id: "zerodha", name: "Zerodha", url: "", blurb: "₹0 equity delivery" },
  { id: "angelone", name: "Angel One", url: "", blurb: "Free demat account" },
  { id: "upstox", name: "Upstox", url: "", blurb: "Quick online onboarding" },
  { id: "dhan", name: "Dhan", url: "", blurb: "Built for active traders" },
  { id: "groww", name: "Groww", url: "", blurb: "Beginner-friendly" },
];

/** Brokers with a real link set — the only ones rendered. */
export function enabledBrokers(): Broker[] {
  return BROKERS.filter((b) => b.url.trim() !== "");
}
