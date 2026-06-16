// Pure statistics for portfolio analytics. No IO, no React — unit-testable.
// All return-series math is daily; annualization uses ~252 trading days.

export const TRADING_DAYS = 252;

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Standard deviation (sample by default). */
export function std(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const denom = xs.length - (sample ? 1 : 0);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / denom;
  return Math.sqrt(v);
}

/** Simple daily returns from a close series: P_t / P_{t-1} − 1. */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const p0 = closes[i - 1];
    if (p0 > 0) out.push(closes[i] / p0 - 1);
  }
  return out;
}

export function annualVol(rets: number[]): number {
  return std(rets) * Math.sqrt(TRADING_DAYS);
}

/** p-th percentile (0..100) by nearest-rank on a sorted copy. */
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)));
  return s[idx];
}

/** Historical 1-day VaR at confidence c (e.g. 95) as a POSITIVE loss fraction. */
export function historicalVaR(rets: number[], c = 95): number {
  if (!rets.length) return 0;
  return Math.max(0, -percentile(rets, 100 - c));
}

/** Conditional VaR (expected shortfall) — mean of the losses beyond VaR. */
export function cvar(rets: number[], c = 95): number {
  if (!rets.length) return 0;
  const thr = percentile(rets, 100 - c);
  const tail = rets.filter((r) => r <= thr);
  return Math.max(0, -(tail.length ? mean(tail) : thr));
}

/** Compound a return series into a NAV path starting at 1. */
export function navFromReturns(rets: number[]): number[] {
  const nav = [1];
  for (const r of rets) nav.push(nav[nav.length - 1] * (1 + r));
  return nav;
}

/** Max drawdown of a NAV series, as a positive fraction (0..1). */
export function maxDrawdown(nav: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of nav) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd;
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const sa = std(a);
  const sb = std(b);
  if (sa === 0 || sb === 0) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (a[i] - ma) * (b[i] - mb);
  cov /= n - 1;
  return cov / (sa * sb);
}

/** Herfindahl–Hirschman concentration of weights (1/N..1; higher = concentrated). */
export function hhi(weights: number[]): number {
  return weights.reduce((s, w) => s + w * w, 0);
}

/** Z-score each value against the population of finite values; nulls pass through. */
export function zScores(values: (number | null | undefined)[]): (number | null)[] {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const m = mean(valid);
  const s = std(valid);
  return values.map((v) =>
    typeof v === "number" && Number.isFinite(v) && s > 0 ? (v - m) / s : null,
  );
}

/** Money-weighted return (XIRR) via Newton's method. amount<0 = cash out. */
export function xirr(flows: { amount: number; date: number }[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const t0 = flows[0].date;
  const yr = (d: number) => (d - t0) / (365 * 24 * 3600 * 1000);
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / (1 + r) ** yr(f.date), 0);
  const dnpv = (r: number) =>
    flows.reduce((s, f) => s - (yr(f.date) * f.amount) / (1 + r) ** (yr(f.date) + 1), 0);
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) < 1e-7) return next;
    r = next;
  }
  return Number.isFinite(r) ? r : null;
}
