// Risk analytics from the EOD candle history. Fetches per-symbol daily candles,
// aligns them on common dates, builds the weighted portfolio daily-return series,
// and derives volatility / VaR / drawdown. Pure stats live in portfolioMath.
import { api } from "../api/client";
import {
  annualVol,
  cvar,
  historicalVaR,
  maxDrawdown,
  navFromReturns,
} from "./portfolioMath";

export interface RiskResult {
  days: number; // trading days of overlapping history used
  annVol: number; // annualized volatility (fraction)
  var95: number; // 1-day 95% historical VaR (positive loss fraction)
  cvar95: number; // expected shortfall beyond VaR (fraction)
  maxDD: number; // max drawdown of the reconstructed NAV (fraction)
  best: number; // best single-day return (fraction)
  worst: number; // worst single-day return (fraction)
}

/** weights should be market-value weights over the held names (sum ~1). */
export async function computeRisk(
  holdings: { symbol: string; weight: number }[],
  limit = 260,
): Promise<RiskResult | null> {
  const held = holdings.filter((h) => h.weight > 0);
  if (!held.length) return null;

  const series = await Promise.all(
    held.map((h) => api.candles(h.symbol, limit).catch(() => [])),
  );
  // date -> close, per holding
  const maps = series.map((c) => new Map(c.map((b) => [b.date, b.close])));
  if (maps.some((m) => m.size < 2)) return null;

  // Dates present in EVERY series, ascending — so all names move together.
  const base = series[0] ?? [];
  const dates = base
    .map((b) => b.date)
    .filter((d) => maps.every((m) => m.has(d)))
    .sort();
  if (dates.length < 30) return null;

  const portRets: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    let r = 0;
    for (let k = 0; k < held.length; k++) {
      const p0 = maps[k].get(dates[i - 1]);
      const p1 = maps[k].get(dates[i]);
      if (p0 && p1 && p0 > 0) r += held[k].weight * (p1 / p0 - 1);
    }
    portRets.push(r);
  }
  if (portRets.length < 20) return null;

  const nav = navFromReturns(portRets);
  return {
    days: portRets.length,
    annVol: annualVol(portRets),
    var95: historicalVaR(portRets, 95),
    cvar95: cvar(portRets, 95),
    maxDD: maxDrawdown(nav),
    best: Math.max(...portRets),
    worst: Math.min(...portRets),
  };
}
