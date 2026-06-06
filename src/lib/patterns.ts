import type { SeriesMarker, Time } from "lightweight-charts";

// Lightweight, rule-based chart-pattern detection on daily OHLC.
//
// DESCRIPTIVE ONLY. We name a geometric formation and, in draw mode, trace its
// shape over the price — in a single neutral colour (white). No bullish/bearish
// labelling, no red/green colour-coding, no targets or recommendations. This is
// deliberate: pattern callouts must stay factual (SEBI-compliant), not advisory.

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
  detail?: string;
}

export interface PriceLevel {
  price: number;
  color: string;
  title: string;
}

export interface PatternLine {
  points: { time: Time; value: number }[]; // 2+ points = a polyline tracing the shape
  color: string;
  width: number;
  dashed?: boolean;
  title: string;
}

export interface PatternResult {
  patterns: DetectedPattern[];
  markers: SeriesMarker<Time>[];
  levels: PriceLevel[];
  drawings: PatternLine[]; // shape overlays, all white
}

// Single neutral colour for every pattern drawing/marker (no directional colour).
const WHITE = "#ffffff";
// Muted grey for the factual support/resistance price lines.
const LEVEL = "#8b94a3";

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

// least-squares line over (x = index, y) points
function fit(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const m = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = m * sxx - sx * sx || 1;
  const slope = (m * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / m };
}
const at = (f: { slope: number; intercept: number }, x: number) => f.slope * x + f.intercept;

// quadratic (parabola) through three points — used to trace the rounded cup
function quad(
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x: number,
): number {
  const l1 = ((x - x2) * (x - x3)) / ((x1 - x2) * (x1 - x3));
  const l2 = ((x - x1) * (x - x3)) / ((x2 - x1) * (x2 - x3));
  const l3 = ((x - x1) * (x - x2)) / ((x3 - x1) * (x3 - x2));
  return y1 * l1 + y2 * l2 + y3 * l3;
}

const pctDiff = (a: number, b: number) => Math.abs(a - b) / ((a + b) / 2);

export function detectPatterns(bars: Bar[]): PatternResult {
  const patterns: DetectedPattern[] = [];
  const markers: SeriesMarker<Time>[] = [];
  const levels: PriceLevel[] = [];
  const drawings: PatternLine[] = [];
  const n = bars.length;
  if (n < 30) return { patterns, markers, levels, drawings };

  const closes = bars.map((b) => b.close);
  const last = bars[n - 1];
  const T = (i: number) => bars[i].time as Time;
  const mark = (i: number, text: string, pos: "aboveBar" | "belowBar" = "aboveBar") =>
    markers.push({ time: T(i), position: pos, color: WHITE, shape: "circle", text });
  // Build a polyline of unique, strictly-increasing bar times across [a,b].
  const curve = (a: number, b: number, count: number, valueAt: (i: number) => number): PatternLine["points"] => {
    const pts: PatternLine["points"] = [];
    let prev = -1;
    for (let s = 0; s <= count; s++) {
      const idx = Math.round(a + ((b - a) * s) / count);
      if (idx <= prev || idx < 0 || idx > n - 1) continue;
      prev = idx;
      pts.push({ time: T(idx), value: valueAt(idx) });
    }
    return pts;
  };

  // ---- 50/200 moving-average cross (factual event) ----
  const within = 25;
  for (let i = Math.max(1, n - within); i < n; i++) {
    const f0 = sma(closes, 50, i - 1), f1 = sma(closes, 50, i);
    const s0 = sma(closes, 200, i - 1), s1 = sma(closes, 200, i);
    if (f0 != null && f1 != null && s0 != null && s1 != null) {
      if ((f0 <= s0 && f1 > s1) || (f0 >= s0 && f1 < s1)) {
        patterns.push({ label: "50/200 MA cross", detail: "The 50-day and 200-day moving averages crossed" });
        mark(i, "MA cross");
        break;
      }
    }
  }

  // ---- 52-week extreme (factual) ----
  const win = Math.min(252, n);
  let hi = -Infinity, lo = Infinity;
  for (let i = n - win; i < n - 1; i++) {
    if (bars[i].high > hi) hi = bars[i].high;
    if (bars[i].low < lo) lo = bars[i].low;
  }
  const newHigh = last.high >= hi;
  const newLow = last.low <= lo;
  if (newHigh) {
    patterns.push({ label: "52-week high", detail: "Price reached a new 52-week high" });
    mark(n - 1, "52w high", "belowBar");
  } else if (newLow) {
    patterns.push({ label: "52-week low", detail: "Price reached a new 52-week low" });
    mark(n - 1, "52w low");
  }

  // ---- swing pivots ----
  const k = 5;
  const pivHighs: number[] = [];
  const pivLows: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isPivotHigh(bars, i, k)) pivHighs.push(i);
    if (isPivotLow(bars, i, k)) pivLows.push(i);
  }

  // ---- Double top (M) / Double bottom (W) ----
  const W = Math.min(90, n);
  const winStart = n - W;
  let dt: { a: number; b: number; valley: number; vIdx: number } | null = null;
  let db: { a: number; b: number; crest: number; cIdx: number } | null = null;

  const winHighs = pivHighs.filter((i) => i >= winStart);
  if (!newHigh && winHighs.length >= 2) {
    const [p, q] = [...winHighs].sort((x, y) => bars[y].high - bars[x].high).slice(0, 2);
    const a = Math.min(p, q), b = Math.max(p, q);
    let valley = Infinity, vIdx = a;
    for (let i = a; i <= b; i++) if (bars[i].low < valley) { valley = bars[i].low; vIdx = i; }
    if (vIdx <= a || vIdx >= b) vIdx = Math.floor((a + b) / 2);
    const peak = Math.min(bars[a].high, bars[b].high);
    if (b - a >= 8 && pctDiff(bars[a].high, bars[b].high) <= 0.03 && (peak - valley) / peak >= 0.04 && last.close < peak)
      dt = { a, b, valley, vIdx };
  }
  const winLows = pivLows.filter((i) => i >= winStart);
  if (!newLow && winLows.length >= 2) {
    const [p, q] = [...winLows].sort((x, y) => bars[x].low - bars[y].low).slice(0, 2);
    const a = Math.min(p, q), b = Math.max(p, q);
    let crest = -Infinity, cIdx = a;
    for (let i = a; i <= b; i++) if (bars[i].high > crest) { crest = bars[i].high; cIdx = i; }
    if (cIdx <= a || cIdx >= b) cIdx = Math.floor((a + b) / 2);
    const trough = Math.max(bars[a].low, bars[b].low);
    if (b - a >= 8 && pctDiff(bars[a].low, bars[b].low) <= 0.03 && (crest - trough) / trough >= 0.04 && last.close > trough)
      db = { a, b, crest, cIdx };
  }
  if (dt && db) { if (dt.b >= db.b) db = null; else dt = null; } // never both at once

  if (dt) {
    patterns.push({ label: "Double top (M)", detail: "Two peaks near the same level with a trough between" });
    const pre = Math.max(0, dt.a - 4), post = Math.min(n - 1, dt.b + 4);
    drawings.push({
      points: [
        { time: T(pre), value: dt.valley }, { time: T(dt.a), value: bars[dt.a].high },
        { time: T(dt.vIdx), value: dt.valley }, { time: T(dt.b), value: bars[dt.b].high },
        { time: T(post), value: dt.valley },
      ], color: WHITE, width: 2, title: "Double top (M)",
    });
    mark(dt.a, "M"); mark(dt.b, "M");
  }
  if (db) {
    patterns.push({ label: "Double bottom (W)", detail: "Two troughs near the same level with a peak between" });
    const pre = Math.max(0, db.a - 4), post = Math.min(n - 1, db.b + 4);
    drawings.push({
      points: [
        { time: T(pre), value: db.crest }, { time: T(db.a), value: bars[db.a].low },
        { time: T(db.cIdx), value: db.crest }, { time: T(db.b), value: bars[db.b].low },
        { time: T(post), value: db.crest },
      ], color: WHITE, width: 2, title: "Double bottom (W)",
    });
    mark(db.a, "W", "belowBar"); mark(db.b, "W", "belowBar");
  }

  // ---- Triangle: converging trendlines over the recent swings ----
  (() => {
    const tw = Math.min(70, n);
    const s = n - tw;
    const hh = pivHighs.filter((i) => i >= s);
    const ll = pivLows.filter((i) => i >= s);
    if (hh.length < 2 || ll.length < 2) return;
    const fh = fit(hh, hh.map((i) => bars[i].high));
    const fl = fit(ll, ll.map((i) => bars[i].low));
    const xs = s, xe = n - 1;
    const gapStart = at(fh, xs) - at(fl, xs);
    const gapEnd = at(fh, xe) - at(fl, xe);
    if (!(gapEnd > 0 && gapStart > gapEnd * 1.3)) return; // lines must actually converge
    let himax = -Infinity, lomin = Infinity;
    for (let i = s; i < n; i++) { if (bars[i].high > himax) himax = bars[i].high; if (bars[i].low < lomin) lomin = bars[i].low; }
    const flat = ((himax - lomin) / tw) * 0.15;
    let kind: string;
    if (Math.abs(fh.slope) < flat && fl.slope > flat) kind = "ascending";
    else if (fh.slope < -flat && Math.abs(fl.slope) < flat) kind = "descending";
    else if (fh.slope < -flat && fl.slope > flat) kind = "symmetrical";
    else return;
    patterns.push({ label: `Triangle (${kind})`, detail: "Converging trendlines" });
    drawings.push({ points: [{ time: T(xs), value: at(fh, xs) }, { time: T(xe), value: at(fh, xe) }], color: WHITE, width: 1, title: "Triangle" });
    drawings.push({ points: [{ time: T(xs), value: at(fl, xs) }, { time: T(xe), value: at(fl, xe) }], color: WHITE, width: 1, title: "Triangle" });
  })();

  // ---- Cup & handle: rounded base toward the prior high, then a shallow handle ----
  (() => {
    const cw = Math.min(140, n);
    if (cw < 50) return;
    const s = n - cw;
    const lEnd = s + Math.floor(cw * 0.25);
    const rStart = s + Math.floor(cw * 0.55);
    const rEnd = n - 4;
    if (rEnd <= rStart) return;
    let L = s; for (let i = s; i < lEnd; i++) if (bars[i].high > bars[L].high) L = i;
    let R = rStart; for (let i = rStart; i < rEnd; i++) if (bars[i].high > bars[R].high) R = i;
    if (R - L < 20) return;
    let B = L; for (let i = L; i <= R; i++) if (bars[i].low < bars[B].low) B = i;
    if (B <= L || B >= R) B = Math.floor((L + R) / 2);
    const rimL = bars[L].high, rimR = bars[R].high, bottom = bars[B].low;
    const rim = Math.min(rimL, rimR);
    const depth = (rim - bottom) / rim;
    if (depth < 0.12 || depth > 0.5) return;            // a real bowl, not noise / not a crash
    if (pctDiff(rimL, rimR) > 0.06) return;             // both rims at a similar level
    if (Math.abs(B - (L + R) / 2) > (R - L) * 0.35) return; // bottom roughly central (rounded)
    let hMin = Infinity; for (let i = R; i < n; i++) hMin = Math.min(hMin, bars[i].low);
    if ((rimR - hMin) / rimR > depth * 0.5) return;     // handle must be shallow vs the cup

    patterns.push({ label: "Cup & handle", detail: "Rounded base recovering toward the prior high, with a shallow handle" });
    // cup: parabola through the two rims and the bottom
    const cup = curve(L, R, 16, (i) => quad(L, rimL, B, bottom, R, rimR, i));
    if (cup.length >= 3) drawings.push({ points: cup, color: WHITE, width: 2, title: "Cup" });
    // handle: the actual price path from the right rim to now
    const handle = curve(R, n - 1, 6, (i) => bars[i].close);
    if (handle.length >= 2) drawings.push({ points: handle, color: WHITE, width: 2, title: "Handle" });
    mark(B, "Cup", "belowBar");
  })();

  // ---- Flag: a sharp move (pole) followed by a tight consolidation channel ----
  (() => {
    const lookback = Math.min(28, n);
    let ps = -1, pe = -1, best = 0;
    for (let e = n - 4; e >= n - lookback + 1; e--) {
      for (let st = Math.max(0, e - 6); st < e; st++) {
        const g = (bars[e].high - bars[st].low) / bars[st].low;
        if (g >= 0.18 && g > best) { best = g; ps = st; pe = e; }
      }
    }
    if (pe < 0 || n - 1 - pe < 3) return;
    const fStart = pe;
    const fEnd = n - 1;
    let innerHi = -Infinity;
    for (let i = fStart; i < fEnd; i++) innerHi = Math.max(innerHi, bars[i].high);
    const cEnd = bars[fEnd].close > innerHi ? fEnd - 1 : fEnd;
    if (cEnd - fStart < 2) return;
    const poleRange = bars[pe].high - bars[ps].low;
    let fHi = -Infinity, fLo = Infinity;
    for (let i = fStart; i <= cEnd; i++) { fHi = Math.max(fHi, bars[i].high); fLo = Math.min(fLo, bars[i].low); }
    if (fHi - fLo > 0.6 * poleRange) return;
    if ((bars[pe].high - fLo) / poleRange > 0.6) return;
    const xs: number[] = [], hy: number[] = [], ly: number[] = [];
    for (let i = fStart; i <= cEnd; i++) { xs.push(i); hy.push(bars[i].high); ly.push(bars[i].low); }
    const fh = fit(xs, hy), fl = fit(xs, ly);
    if (fh.slope > poleRange * 0.05) return;

    patterns.push({ label: "Flag", detail: "Tight consolidation channel after a sharp move" });
    // the pole, then the two channel rails — all white
    drawings.push({ points: [{ time: T(ps), value: bars[ps].low }, { time: T(pe), value: bars[pe].high }], color: WHITE, width: 2, title: "Flagpole" });
    drawings.push({ points: [{ time: T(fStart), value: at(fh, fStart) }, { time: T(cEnd), value: at(fh, cEnd) }], color: WHITE, width: 1, title: "Flag" });
    drawings.push({ points: [{ time: T(fStart), value: at(fl, fStart) }, { time: T(cEnd), value: at(fl, cEnd) }], color: WHITE, width: 1, title: "Flag" });
    mark(fEnd, "Flag", "belowBar");
  })();

  // ---- support / resistance = most recent pivot low / high (factual levels) ----
  if (pivLows.length) levels.push({ price: bars[pivLows[pivLows.length - 1]].low, color: LEVEL, title: "Support" });
  if (pivHighs.length) levels.push({ price: bars[pivHighs[pivHighs.length - 1]].high, color: LEVEL, title: "Resistance" });

  // ---- candlestick on the latest bar (factual shape names only) ----
  const prev = bars[n - 2];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low || 1;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const engulf =
    (last.close > last.open && prev.close < prev.open && last.open <= prev.close && last.close >= prev.open) ||
    (last.close < last.open && prev.close > prev.open && last.open >= prev.close && last.close <= prev.open);
  if (engulf) patterns.push({ label: "Engulfing candle", detail: "Latest candle's body engulfs the prior one" });
  else if (body <= 0.1 * range) patterns.push({ label: "Doji", detail: "Open ≈ close (indecision)" });
  else if (lowerWick > 2 * body && upperWick < body) patterns.push({ label: "Hammer", detail: "Long lower wick, small body" });
  else if (upperWick > 2 * body && lowerWick < body) patterns.push({ label: "Shooting star", detail: "Long upper wick, small body" });

  return { patterns, markers, levels, drawings };
}
