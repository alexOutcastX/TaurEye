import type { SeriesMarker, Time } from "lightweight-charts";

// Lightweight, rule-based chart-pattern detection on daily OHLC. Descriptive
// only (no predictions/recommendations). Runs client-side on the candle data
// already loaded for the chart, so no extra data or services are needed.

export interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DetectedPattern {
  label: string;
  kind: "bull" | "bear" | "neutral";
  detail?: string;
}

export interface PriceLevel {
  price: number;
  color: string;
  title: string;
}

export interface PatternLine {
  points: { time: Time; value: number }[]; // 2 points = a straight segment
  color: string;
  width: number;
  dashed?: boolean;
  title: string;
}

export interface PatternResult {
  patterns: DetectedPattern[];
  markers: SeriesMarker<Time>[];
  levels: PriceLevel[];
  drawings: PatternLine[]; // line overlays (necklines, connectors, trendlines)
}

const UP = "#18c98c";
const DOWN = "#f0506e";
const WHITE = "#ffffff";

function sma(vals: number[], period: number, endIdx: number): number | null {
  if (endIdx + 1 < period) return null;
  let s = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) s += vals[i];
  return s / period;
}

// pivot high: bar i is a strict local max within +/- k bars
function isPivotHigh(bars: Bar[], i: number, k: number): boolean {
  if (i < k || i >= bars.length - k) return false;
  const h = bars[i].high;
  for (let j = i - k; j <= i + k; j++) if (j !== i && bars[j].high >= h) return false;
  return true;
}
function isPivotLow(bars: Bar[], i: number, k: number): boolean {
  if (i < k || i >= bars.length - k) return false;
  const l = bars[i].low;
  for (let j = i - k; j <= i + k; j++) if (j !== i && bars[j].low <= l) return false;
  return true;
}

export function detectPatterns(bars: Bar[]): PatternResult {
  const patterns: DetectedPattern[] = [];
  const markers: SeriesMarker<Time>[] = [];
  const levels: PriceLevel[] = [];
  const drawings: PatternLine[] = [];
  const n = bars.length;
  if (n < 30) return { patterns, markers, levels, drawings };

  const closes = bars.map((b) => b.close);
  const last = bars[n - 1];

  // ---- MA crossovers (recent) ----
  const within = 25;
  for (let i = Math.max(1, n - within); i < n; i++) {
    const f0 = sma(closes, 50, i - 1), f1 = sma(closes, 50, i);
    const s0 = sma(closes, 200, i - 1), s1 = sma(closes, 200, i);
    if (f0 != null && f1 != null && s0 != null && s1 != null) {
      if (f0 <= s0 && f1 > s1) {
        markers.push({ time: bars[i].time as Time, position: "belowBar", color: UP, shape: "arrowUp", text: "Golden cross" });
        patterns.push({ label: "Golden cross", kind: "bull", detail: "50-DMA crossed above 200-DMA" });
      } else if (f0 >= s0 && f1 < s1) {
        markers.push({ time: bars[i].time as Time, position: "aboveBar", color: DOWN, shape: "arrowDown", text: "Death cross" });
        patterns.push({ label: "Death cross", kind: "bear", detail: "50-DMA crossed below 200-DMA" });
      }
    }
  }

  // ---- 52-week breakout / breakdown ----
  const win = Math.min(252, n);
  let hi = -Infinity, lo = Infinity;
  for (let i = n - win; i < n - 1; i++) {
    if (bars[i].high > hi) hi = bars[i].high;
    if (bars[i].low < lo) lo = bars[i].low;
  }
  const newHigh = last.high >= hi;
  const newLow = last.low <= lo;
  if (newHigh) {
    patterns.push({ label: "52-week breakout", kind: "bull", detail: "New 52-week high" });
    markers.push({ time: last.time as Time, position: "belowBar", color: UP, shape: "arrowUp", text: "52w breakout" });
  } else if (newLow) {
    patterns.push({ label: "52-week breakdown", kind: "bear", detail: "New 52-week low" });
    markers.push({ time: last.time as Time, position: "aboveBar", color: DOWN, shape: "arrowDown", text: "52w low" });
  }

  // ---- swing pivots → trend + support/resistance + double top/bottom ----
  const k = 5;
  const pivHighs: number[] = [];
  const pivLows: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isPivotHigh(bars, i, k)) pivHighs.push(i);
    if (isPivotLow(bars, i, k)) pivLows.push(i);
  }

  // ---- dominant trend: a clear diagonal across the recent move (extreme→extreme) ----
  {
    const tw = Math.min(60, n);
    const tStart = n - tw;
    let loI = tStart, hiI = tStart;
    for (let i = tStart; i < n; i++) {
      if (bars[i].low < bars[loI].low) loI = i;
      if (bars[i].high > bars[hiI].high) hiI = i;
    }
    const move = (bars[hiI].high - bars[loI].low) / bars[loI].low;
    if (move >= 0.08 && hiI - loI >= 5) {
      patterns.push({ label: "Uptrend", kind: "bull", detail: "Rising from the recent swing low" });
      drawings.push({
        points: [{ time: bars[loI].time as Time, value: bars[loI].low }, { time: bars[hiI].time as Time, value: bars[hiI].high }],
        color: UP, width: 2, title: "Uptrend",
      });
    } else if (move >= 0.08 && loI - hiI >= 5) {
      patterns.push({ label: "Downtrend", kind: "bear", detail: "Falling from the recent swing high" });
      drawings.push({
        points: [{ time: bars[hiI].time as Time, value: bars[hiI].high }, { time: bars[loI].time as Time, value: bars[loI].low }],
        color: DOWN, width: 2, title: "Downtrend",
      });
    }
  }

  // double top / double bottom — strict, price-confirmed, mutually exclusive.
  // A double top is the two HIGHEST pivot highs in the recent window, at a
  // similar level, with a real valley between them, and price now BELOW that
  // level (rolled over). It can't coexist with a fresh 52w high, and a stock
  // can never be both a double top and a double bottom at once.
  const W = Math.min(90, n);
  const winStart = n - W;
  const pctDiff = (a: number, b: number) => Math.abs(a - b) / ((a + b) / 2);
  let dtA = -1, dtB = -1, dbA = -1, dbB = -1, dtValley = 0, dbCrest = 0;

  const winHighs = pivHighs.filter((i) => i >= winStart);
  if (!newHigh && winHighs.length >= 2) {
    const [p, q] = [...winHighs].sort((x, y) => bars[y].high - bars[x].high).slice(0, 2);
    const a = Math.min(p, q), b = Math.max(p, q);
    let valley = Infinity;
    for (let i = a; i <= b; i++) valley = Math.min(valley, bars[i].low);
    const peak = Math.min(bars[a].high, bars[b].high);
    if (b - a >= 8 && pctDiff(bars[a].high, bars[b].high) <= 0.03 && (peak - valley) / peak >= 0.04 && last.close < peak) {
      dtA = a; dtB = b; dtValley = valley;
    }
  }

  const winLows = pivLows.filter((i) => i >= winStart);
  if (!newLow && winLows.length >= 2) {
    const [p, q] = [...winLows].sort((x, y) => bars[x].low - bars[y].low).slice(0, 2);
    const a = Math.min(p, q), b = Math.max(p, q);
    let crest = -Infinity;
    for (let i = a; i <= b; i++) crest = Math.max(crest, bars[i].high);
    const trough = Math.max(bars[a].low, bars[b].low);
    if (b - a >= 8 && pctDiff(bars[a].low, bars[b].low) <= 0.03 && (crest - trough) / trough >= 0.04 && last.close > trough) {
      dbA = a; dbB = b; dbCrest = crest;
    }
  }

  // never both — keep whichever was confirmed more recently
  if (dtB >= 0 && dbB >= 0) {
    if (dtB >= dbB) { dbA = -1; dbB = -1; } else { dtA = -1; dtB = -1; }
  }

  if (dtB >= 0) {
    patterns.push({ label: "Double top", kind: "bear", detail: "Two peaks at a similar level; price has rolled over" });
    markers.push({ time: bars[dtA].time as Time, position: "aboveBar", color: DOWN, shape: "circle", text: "Top" });
    markers.push({ time: bars[dtB].time as Time, position: "aboveBar", color: DOWN, shape: "circle", text: "Top" });
    // connector across the two peaks + dashed neckline at the valley
    drawings.push({
      points: [{ time: bars[dtA].time as Time, value: bars[dtA].high }, { time: bars[dtB].time as Time, value: bars[dtB].high }],
      color: DOWN, width: 2, title: "Double top",
    });
    drawings.push({
      points: [{ time: bars[dtA].time as Time, value: dtValley }, { time: last.time as Time, value: dtValley }],
      color: DOWN, width: 1, dashed: true, title: "Neckline",
    });
  }
  if (dbB >= 0) {
    patterns.push({ label: "Double bottom", kind: "bull", detail: "Two troughs at a similar level; price has turned up" });
    markers.push({ time: bars[dbA].time as Time, position: "belowBar", color: UP, shape: "circle", text: "Bottom" });
    markers.push({ time: bars[dbB].time as Time, position: "belowBar", color: UP, shape: "circle", text: "Bottom" });
    drawings.push({
      points: [{ time: bars[dbA].time as Time, value: bars[dbA].low }, { time: bars[dbB].time as Time, value: bars[dbB].low }],
      color: UP, width: 2, title: "Double bottom",
    });
    drawings.push({
      points: [{ time: bars[dbA].time as Time, value: dbCrest }, { time: last.time as Time, value: dbCrest }],
      color: UP, width: 1, dashed: true, title: "Neckline",
    });
  }

  // ---- bullish flag: sharp flagpole + tight downward/sideways consolidation ----
  (() => {
    const lookback = Math.min(28, n);
    // find the strongest recent flagpole (>=18% rise over <=6 bars)
    let ps = -1, pe = -1, best = 0;
    for (let e = n - 4; e >= n - lookback + 1; e--) {
      for (let s = Math.max(0, e - 6); s < e; s++) {
        const g = (bars[e].high - bars[s].low) / bars[s].low;
        if (g >= 0.18 && g > best) { best = g; ps = s; pe = e; }
      }
    }
    if (pe < 0 || n - 1 - pe < 3) return; // need a few flag bars after the pole

    const fStart = pe;
    const fEnd = n - 1;
    // a final bar above the consolidation high = breakout (exclude from channel)
    let innerHi = -Infinity;
    for (let i = fStart; i < fEnd; i++) innerHi = Math.max(innerHi, bars[i].high);
    const brokeOut = bars[fEnd].close > innerHi;
    const cEnd = brokeOut ? fEnd - 1 : fEnd;
    if (cEnd - fStart < 2) return;

    const poleRange = bars[pe].high - bars[ps].low;
    let fHi = -Infinity, fLo = Infinity;
    for (let i = fStart; i <= cEnd; i++) { fHi = Math.max(fHi, bars[i].high); fLo = Math.min(fLo, bars[i].low); }
    if (fHi - fLo > 0.6 * poleRange) return; // consolidation too wide to be a flag
    if ((bars[pe].high - fLo) / poleRange > 0.6) return; // retraced too much of the pole

    // least-squares lines for the channel (highs = upper, lows = lower)
    const xs: number[] = [], hy: number[] = [], ly: number[] = [];
    for (let i = fStart; i <= cEnd; i++) { xs.push(i); hy.push(bars[i].high); ly.push(bars[i].low); }
    const fit = (ys: number[]) => {
      const m = xs.length;
      const sx = xs.reduce((a, b) => a + b, 0);
      const sy = ys.reduce((a, b) => a + b, 0);
      const sxx = xs.reduce((a, b) => a + b * b, 0);
      const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
      const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx || 1);
      return { slope, intercept: (sy - slope * sx) / m };
    };
    const fh = fit(hy), fl = fit(ly);
    if (fh.slope > poleRange * 0.05) return; // highs rising too fast → not a flag

    const at = (f: { slope: number; intercept: number }, x: number) => f.slope * x + f.intercept;
    patterns.push({
      label: "Bull flag",
      kind: "bull",
      detail: brokeOut ? "Tight pullback after a sharp rise — breaking out" : "Tight pullback after a sharp rise",
    });
    markers.push({ time: bars[fEnd].time as Time, position: "belowBar", color: WHITE, shape: "arrowUp", text: "Bull flag" });
    drawings.push({
      points: [{ time: bars[fStart].time as Time, value: at(fh, fStart) }, { time: bars[cEnd].time as Time, value: at(fh, cEnd) }],
      color: WHITE, width: 1, title: "Flag",
    });
    drawings.push({
      points: [{ time: bars[fStart].time as Time, value: at(fl, fStart) }, { time: bars[cEnd].time as Time, value: at(fl, cEnd) }],
      color: WHITE, width: 1, title: "Flag",
    });
  })();

  // support / resistance = most recent pivot low / high
  if (pivLows.length) levels.push({ price: bars[pivLows[pivLows.length - 1]].low, color: UP, title: "Support" });
  if (pivHighs.length) levels.push({ price: bars[pivHighs[pivHighs.length - 1]].high, color: DOWN, title: "Resistance" });

  // ---- candlestick on the latest bar ----
  const prev = bars[n - 2];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low || 1;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  if (last.close > last.open && prev.close < prev.open && last.open <= prev.close && last.close >= prev.open) {
    patterns.push({ label: "Bullish engulfing", kind: "bull", detail: "Latest candle engulfs the prior down candle" });
  } else if (last.close < last.open && prev.close > prev.open && last.open >= prev.close && last.close <= prev.open) {
    patterns.push({ label: "Bearish engulfing", kind: "bear", detail: "Latest candle engulfs the prior up candle" });
  } else if (body <= 0.1 * range) {
    patterns.push({ label: "Doji", kind: "neutral", detail: "Open ≈ close (indecision)" });
  } else if (lowerWick > 2 * body && upperWick < body) {
    patterns.push({ label: "Hammer", kind: "bull", detail: "Long lower wick, small body" });
  } else if (upperWick > 2 * body && lowerWick < body) {
    patterns.push({ label: "Shooting star", kind: "bear", detail: "Long upper wick, small body" });
  }

  return { patterns, markers, levels, drawings };
}
