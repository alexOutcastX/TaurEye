// Risk analytics from the EOD candle history. Fetches per-symbol daily candles,
// aligns them on common dates, and derives volatility / VaR / drawdown, plus —
// with a benchmark — beta, tracking error and a NAV-vs-market path, and per-name
// RISK CONTRIBUTION from the holdings' covariance matrix.
//
// Benchmark: a cap-weighted basket of the largest stocks (a broad-market proxy)
// built from the same candle bundle — no extra data source. Memoized per session.
import { api } from "../api/client";
import {
  annualVol,
  beta as betaOf,
  covariance,
  cvar,
  historicalVaR,
  maxDrawdown,
  navFromReturns,
  std,
  TRADING_DAYS,
} from "./portfolioMath";
import type { Metrics } from "../api/types";

export interface RiskResult {
  days: number;
  annVol: number;
  var95: number;
  cvar95: number;
  maxDD: number;
  best: number;
  worst: number;
  beta?: number;
  trackingError?: number;
  series?: { date: string; port: number; bench: number }[];
  // % of total portfolio variance attributable to each holding (sums to ~1).
  riskContrib?: { symbol: string; pct: number }[];
}

interface Aligned {
  dates: string[]; // common dates, ascending (returns are between consecutive)
  rets: number[][]; // rets[k][t] = daily return of holding k, length dates.length-1
}

async function alignedReturns(symbols: string[], limit: number): Promise<Aligned> {
  if (!symbols.length) return { dates: [], rets: [] };
  const series = await Promise.all(symbols.map((s) => api.candles(s, limit).catch(() => [])));
  const maps = series.map((c) => new Map(c.map((b) => [b.date, b.close])));
  const base = series.reduce((a, b) => (b.length > a.length ? b : a), series[0] ?? []);
  const dates = base
    .map((b) => b.date)
    .filter((d) => maps.every((m) => m.has(d)))
    .sort();
  const rets = symbols.map((_, k) => {
    const arr: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const p0 = maps[k].get(dates[i - 1]);
      const p1 = maps[k].get(dates[i]);
      arr.push(p0 && p1 && p0 > 0 ? p1 / p0 - 1 : 0);
    }
    return arr;
  });
  return { dates, rets };
}

/** date -> weighted daily return (used for the cap-weighted benchmark). */
async function weightedReturnsByDate(
  holdings: { symbol: string; weight: number }[],
  limit: number,
): Promise<Map<string, number>> {
  const held = holdings.filter((h) => h.weight > 0);
  if (!held.length) return new Map();
  const { dates, rets } = await alignedReturns(held.map((h) => h.symbol), limit);
  const wsum = held.reduce((s, h) => s + h.weight, 0) || 1;
  const out = new Map<string, number>();
  for (let t = 0; t < dates.length - 1; t++) {
    let r = 0;
    for (let k = 0; k < held.length; k++) r += (held[k].weight / wsum) * rets[k][t];
    out.set(dates[t + 1], r);
  }
  return out;
}

// ---- broad-market benchmark (cap-weighted top names), memoized per session ----
let benchCache: Promise<Map<string, number>> | null = null;

export function loadBenchmark(metrics: Metrics[], topN = 50, limit = 260): Promise<Map<string, number>> {
  if (benchCache) return benchCache;
  benchCache = (async () => {
    const top = metrics
      .filter((m) => (m.segment || "EQ") === "EQ" && m.market_cap_cr && m.market_cap_cr > 0)
      .sort((a, b) => (b.market_cap_cr ?? 0) - (a.market_cap_cr ?? 0))
      .slice(0, topN);
    if (!top.length) return new Map<string, number>();
    return weightedReturnsByDate(top.map((m) => ({ symbol: m.symbol, weight: m.market_cap_cr ?? 0 })), limit);
  })();
  return benchCache;
}

export async function computeRisk(
  holdings: { symbol: string; weight: number }[],
  bench?: Map<string, number>,
  limit = 260,
): Promise<RiskResult | null> {
  const held = holdings.filter((h) => h.weight > 0);
  if (!held.length) return null;
  const { dates, rets } = await alignedReturns(held.map((h) => h.symbol), limit);
  const T = dates.length - 1;
  if (T < 20) return null;

  const wsum = held.reduce((s, h) => s + h.weight, 0) || 1;
  const w = held.map((h) => h.weight / wsum);

  // weighted portfolio daily returns + date index
  const portRets: number[] = [];
  const byDate = new Map<string, number>();
  for (let t = 0; t < T; t++) {
    let r = 0;
    for (let k = 0; k < held.length; k++) r += w[k] * rets[k][t];
    portRets.push(r);
    byDate.set(dates[t + 1], r);
  }

  // covariance matrix -> risk contributions (component contribution to variance)
  const n = held.length;
  const C: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) {
    for (let b = a; b < n; b++) {
      const c = covariance(rets[a], rets[b]);
      C[a][b] = c;
      C[b][a] = c;
    }
  }
  const Cw = w.map((_, a) => w.reduce((s, wj, j) => s + C[a][j] * wj, 0));
  const portVar = w.reduce((s, wa, a) => s + wa * Cw[a], 0);
  const riskContrib = held.map((h, a) => ({
    symbol: h.symbol,
    pct: portVar > 0 ? (w[a] * Cw[a]) / portVar : 0,
  }));

  const nav = navFromReturns(portRets);
  const result: RiskResult = {
    days: T,
    annVol: annualVol(portRets),
    var95: historicalVaR(portRets, 95),
    cvar95: cvar(portRets, 95),
    maxDD: maxDrawdown(nav),
    best: Math.max(...portRets),
    worst: Math.min(...portRets),
    riskContrib,
  };

  if (bench && bench.size) {
    const common = [...byDate.keys()].filter((d) => bench.has(d)).sort();
    if (common.length >= 20) {
      const rp = common.map((d) => byDate.get(d) as number);
      const rm = common.map((d) => bench.get(d) as number);
      result.beta = betaOf(rp, rm);
      result.trackingError = std(rp.map((x, i) => x - rm[i])) * Math.sqrt(TRADING_DAYS);
      let p = 1;
      let b = 1;
      result.series = common.map((d, i) => {
        p *= 1 + rp[i];
        b *= 1 + rm[i];
        return { date: d, port: (p - 1) * 100, bench: (b - 1) * 100 };
      });
    }
  }
  return result;
}
