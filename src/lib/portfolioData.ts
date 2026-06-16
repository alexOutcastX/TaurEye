// Risk analytics from the EOD candle history. Fetches per-symbol daily candles,
// aligns them on common dates, builds the weighted portfolio daily-return series
// (keyed by date), and derives volatility / VaR / drawdown. With a benchmark
// return series it also yields beta, tracking error and a NAV-vs-market path.
//
// Benchmark: a cap-weighted basket of the largest stocks (a broad-market /
// "NIFTY-like" proxy) built from the same candle bundle — no extra data source.
// It is fetched/computed once per session and memoized.
import { api } from "../api/client";
import {
  annualVol,
  beta as betaOf,
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
  beta?: number; // vs the broad-market benchmark
  trackingError?: number; // annualized stdev of (port − market)
  // Aligned cumulative-return paths (%, from 0) for the NAV-vs-market chart.
  series?: { date: string; port: number; bench: number }[];
}

/** date(YYYY-MM-DD) -> weighted daily return, for a set of weighted holdings. */
async function weightedReturnsByDate(
  holdings: { symbol: string; weight: number }[],
  limit: number,
): Promise<Map<string, number>> {
  const held = holdings.filter((h) => h.weight > 0);
  if (!held.length) return new Map();
  const series = await Promise.all(held.map((h) => api.candles(h.symbol, limit).catch(() => [])));
  const maps = series.map((c) => new Map(c.map((b) => [b.date, b.close])));
  const base = series.reduce((a, b) => (b.length > a.length ? b : a), series[0] ?? []);
  // dates present in EVERY holding, ascending — so all names move together.
  const dates = base
    .map((b) => b.date)
    .filter((d) => maps.every((m) => m.has(d)))
    .sort();
  const out = new Map<string, number>();
  const wsum = held.reduce((s, h) => s + h.weight, 0) || 1;
  for (let i = 1; i < dates.length; i++) {
    let r = 0;
    for (let k = 0; k < held.length; k++) {
      const p0 = maps[k].get(dates[i - 1]);
      const p1 = maps[k].get(dates[i]);
      if (p0 && p1 && p0 > 0) r += (held[k].weight / wsum) * (p1 / p0 - 1);
    }
    out.set(dates[i], r);
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
    return weightedReturnsByDate(
      top.map((m) => ({ symbol: m.symbol, weight: m.market_cap_cr ?? 0 })),
      limit,
    );
  })();
  return benchCache;
}

export async function computeRisk(
  holdings: { symbol: string; weight: number }[],
  bench?: Map<string, number>,
  limit = 260,
): Promise<RiskResult | null> {
  const byDate = await weightedReturnsByDate(holdings, limit);
  if (byDate.size < 20) return null;

  const dates = [...byDate.keys()].sort();
  const portRets = dates.map((d) => byDate.get(d) as number);
  const nav = navFromReturns(portRets);

  const result: RiskResult = {
    days: portRets.length,
    annVol: annualVol(portRets),
    var95: historicalVaR(portRets, 95),
    cvar95: cvar(portRets, 95),
    maxDD: maxDrawdown(nav),
    best: Math.max(...portRets),
    worst: Math.min(...portRets),
  };

  if (bench && bench.size) {
    const common = dates.filter((d) => bench.has(d));
    if (common.length >= 20) {
      const rp = common.map((d) => byDate.get(d) as number);
      const rm = common.map((d) => bench.get(d) as number);
      result.beta = betaOf(rp, rm);
      const diff = rp.map((x, i) => x - rm[i]);
      result.trackingError = std(diff) * Math.sqrt(TRADING_DAYS);
      // cumulative-return paths from 0
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
