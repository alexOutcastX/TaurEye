// Credit economy — SCAFFOLD with all values set to ZERO.
//
// The structure (balance, append-only ledger, faucets, sinks, gating, ads) is
// real, but every cost and reward is currently 0 and ECONOMY_ENABLED is false,
// so nothing is charged and every premium action is unlocked/free. When the
// real numbers are decided, set ECONOMY_ENABLED = true and fill COSTS/REWARDS —
// no other code needs to change.

export const ECONOMY_ENABLED = false;

// Credits charged to use premium features (sinks). All 0 for now.
export const COSTS = {
  aiAnalysis: 0,
  nlScreenBuilder: 0,
  patternScan: 0,
  advancedReport: 0,
  noAdPack: 0,
} as const;

// Credits granted (faucets). All 0 for now.
export const REWARDS = {
  signupBonus: 0,
  dailyClaim: 0,
  rewardedAd: 0,
  referrer: 0,
  referee: 0,
} as const;

export interface CreditTxn {
  id: string;
  ts: string; // ISO
  delta: number; // + earn / - spend
  reason: string;
}

const LEDGER_KEY = "taureye.credits.ledger.v1";
const ADS_KEY = "taureye.ads.disabled.v1";
const CLAIM_KEY = "taureye.credits.lastDailyClaim.v1";

// ---- change notification (so badges/pages re-render) ----
type Listener = () => void;
const listeners = new Set<Listener>();
export function onEconomyChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function emit() {
  listeners.forEach((l) => l());
}

// ---- ledger ----
function readLedger(): CreditTxn[] {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]") as CreditTxn[];
  } catch {
    return [];
  }
}
function writeLedger(rows: CreditTxn[]) {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(rows));
  emit();
}
function record(delta: number, reason: string) {
  const rows = readLedger();
  rows.push({
    id: Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
    delta,
    reason,
  });
  writeLedger(rows);
}

/** Newest-first transaction history. */
export function getLedger(): CreditTxn[] {
  return readLedger().slice().reverse();
}
/** Current balance = sum of all ledger deltas. */
export function getBalance(): number {
  return readLedger().reduce((s, t) => s + t.delta, 0);
}

// ---- earn / spend ----
export function earn(reason: string, amount: number) {
  if (amount > 0) record(amount, reason);
}
export function canAfford(cost: number): boolean {
  return !ECONOMY_ENABLED || cost <= 0 || getBalance() >= cost;
}
/**
 * Attempt to spend credits for a premium action. Returns true if allowed.
 * While the economy is disabled (or cost is 0), it's always allowed and free.
 */
export function spend(reason: string, cost: number): boolean {
  if (!ECONOMY_ENABLED || cost <= 0) return true;
  if (getBalance() >= cost) {
    record(-cost, reason);
    return true;
  }
  return false;
}

// ---- daily free claim ----
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
export function dailyClaimAvailable(): boolean {
  return localStorage.getItem(CLAIM_KEY) !== todayStr();
}
export function claimDaily(): boolean {
  if (!dailyClaimAvailable()) return false;
  localStorage.setItem(CLAIM_KEY, todayStr());
  earn("daily_claim", REWARDS.dailyClaim);
  emit();
  return true;
}

// ---- rewarded ad (placeholder; real AdMob integration later) ----
export function watchRewardedAd(): Promise<boolean> {
  // Simulates an ad view; grants the (currently 0) reward.
  return new Promise((resolve) => {
    setTimeout(() => {
      earn("rewarded_ad", REWARDS.rewardedAd);
      resolve(true);
    }, 400);
  });
}

// ---- ads / no-ad pack ----
export function adsDisabled(): boolean {
  return localStorage.getItem(ADS_KEY) === "1";
}
export function buyNoAdPack(): boolean {
  if (adsDisabled()) return true;
  if (!spend("no_ad_pack", COSTS.noAdPack)) return false;
  localStorage.setItem(ADS_KEY, "1");
  emit();
  return true;
}
