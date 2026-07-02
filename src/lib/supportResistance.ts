// Client-side support/resistance — a faithful port of the data engine's
// backend/app/dataengine/indicators.py::support_resistance, so the Screener can
// fill the Sup/Res D/W/M columns locally (from candles) whether or not the
// published metrics.json already carries them. Same pivot logic the chart uses
// to draw S/R lines, so on-screen values, exports and the nightly bundle agree.

import type { Candle } from "../api/types";

export type SRKey =
  | "dist_sup_d_pct"
  | "dist_res_d_pct"
  | "dist_sup_w_pct"
  | "dist_res_w_pct"
  | "dist_sup_m_pct"
  | "dist_res_m_pct";

export type SR = Record<SRKey, number | null>;

export const EMPTY_SR: SR = {
  dist_sup_d_pct: null, dist_res_d_pct: null,
  dist_sup_w_pct: null, dist_res_w_pct: null,
  dist_sup_m_pct: null, dist_res_m_pct: null,
};

export const SR_KEYS: SRKey[] = [
  "dist_sup_d_pct", "dist_res_d_pct",
  "dist_sup_w_pct", "dist_res_w_pct",
  "dist_sup_m_pct", "dist_res_m_pct",
];

const pct = (a: number, b: number): number => (b ? Math.round((a / b - 1) * 10000) / 100 : 0);

// ISO week key (matches the chart's weekly resample and Python isocalendar).
function isoWeek(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7,
    );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function resample(candles: Candle[], tf: "D" | "W" | "M"): Candle[] {
  if (tf === "D") return candles;
  const buckets = new Map<string, Candle[]>();
  const order: string[] = [];
  for (const c of candles) {
    const key = tf === "M" ? c.date.slice(0, 7) : isoWeek(c.date);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
      order.push(key);
    }
    arr.push(c);
  }
  return order.map((k) => {
    const g = buckets.get(k)!;
    return {
      date: g[g.length - 1].date,
      open: g[0].open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, x) => s + x.volume, 0),
    };
  });
}

// Strict swing highs/lows: a bar that is the extreme within ±k bars.
function pivots(bars: Candle[], k: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const n = bars.length;
  for (let i = k; i < n - k; i++) {
    const h = bars[i].high;
    let isHigh = true;
    const lo = bars[i].low;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].high > h) isHigh = false;
      if (bars[j].low < lo) isLow = false;
    }
    if (isHigh) highs.push(h);
    if (isLow) lows.push(lo);
  }
  return { highs, lows };
}

// [% from support, % from resistance] on one timeframe (support ≥ 0, res ≤ 0).
function sr(candles: Candle[], tf: "D" | "W" | "M", k: number): [number | null, number | null] {
  const bars = resample(candles, tf);
  if (bars.length < 2 * k + 2) return [null, null];
  const close = bars[bars.length - 1].close;
  const { highs, lows } = pivots(bars, k);
  const above = highs.filter((h) => h > close);
  const below = lows.filter((l) => l < close);
  const resistance = above.length ? Math.min(...above) : Math.max(...bars.map((b) => b.high));
  const support = below.length ? Math.max(...below) : Math.min(...bars.map((b) => b.low));
  return [pct(close, support), pct(close, resistance)];
}

/** All six S/R distances (D/W/M) from a symbol's candle history. */
export function computeSR(candles: Candle[]): SR {
  if (!candles || candles.length < 12) return EMPTY_SR;
  const [sd, rd] = sr(candles, "D", 5);
  const [sw, rw] = sr(candles, "W", 3);
  const [sm, rm] = sr(candles, "M", 2);
  return {
    dist_sup_d_pct: sd, dist_res_d_pct: rd,
    dist_sup_w_pct: sw, dist_res_w_pct: rw,
    dist_sup_m_pct: sm, dist_res_m_pct: rm,
  };
}
