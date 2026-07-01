import type { Filter, Logic } from "../api/types";

/**
 * Local, rule-based natural-language → screen translator. Deterministic and
 * offline (no LLM). It splits the query into clauses (on and / or / commas),
 * then for each clause resolves a field + comparator + value into the screener's
 * Filter schema. It understands flexible phrasing — many operator synonyms
 * (above / over / greater than / at least / >, below / under / <=, between … and
 * …, N or more), units (%, ₹, cr / lakh / k / x), moving-average distance,
 * 52-week range, and support/resistance on the daily, weekly and monthly
 * timeframes — and reports back both what it understood and what it ignored.
 *
 * Note: the screener applies ONE logic (AND/OR) to all filters; the query's
 * "or" (if present) selects OR, otherwise AND.
 */
export interface ParsedScreen {
  filters: Filter[];
  logic: Logic;
  segments: string[] | null;
  recognized: string[]; // human-readable list of what matched
  unrecognized: string[]; // clauses that produced no filter (so the UI can say so)
  matchedAny: boolean;
}

type Op = Filter["op"];
type Match = { filters: Filter[]; label: string };

const NUM = String.raw`(-?\d[\d,]*(?:\.\d+)?)`;
const toNum = (s: string) => parseFloat(s.replace(/,/g, ""));

const LABELS: Record<string, string> = {
  rsi_14: "RSI",
  atr_pct: "ATR %",
  macd_hist: "MACD hist",
  rel_volume: "Rel volume",
  close: "Price",
  market_cap_cr: "Market cap (cr)",
  volume: "Volume",
  change_pct: "% change",
  pct_above_sma20: "vs 20 DMA",
  pct_above_sma50: "vs 50 DMA",
  pct_above_sma200: "vs 200 DMA",
  dist_52w_high_pct: "from 52w high",
  dist_52w_low_pct: "from 52w low",
  dist_sup_d_pct: "from support (D)",
  dist_res_d_pct: "from resistance (D)",
  dist_sup_w_pct: "from support (W)",
  dist_res_w_pct: "from resistance (W)",
  dist_sup_m_pct: "from support (M)",
  dist_res_m_pct: "from resistance (M)",
};
const OPSYM: Record<Op, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", between: "" };

function fLabel(f: Filter): string {
  const n = LABELS[f.field] ?? f.field;
  if (f.op === "between") return `${n} ${f.value}…${f.value2}`;
  return `${n} ${OPSYM[f.op]} ${f.value}`;
}
const one = (f: Filter, label?: string): Match => ({ filters: [f], label: label ?? fLabel(f) });

// ---- normalise the raw text into a predictable form ----
function normalize(t: string): string {
  return (" " + t.toLowerCase() + " ")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\bpercent\b/g, "%")
    .replace(/\bpct\b/g, "%")
    .replace(/\bgreater than or equal to\b/g, ">=")
    .replace(/\bless than or equal to\b/g, "<=")
    .replace(/\bequal to\b/g, "=")
    .replace(/\bcrores?\b/g, "cr")
    .replace(/\b(?:lacs?|lakhs)\b/g, "lakh")
    .replace(/\brsi\s*\(?\s*14\s*\)?/g, "rsi")
    .replace(/\bd\.?\s?m\.?\s?a\b/g, "dma")
    .replace(/\s+/g, " ");
}

// ---- comparator + value, e.g. "below 30", "between 5 and 20", "100 or more" ----
function parseCmp(s: string): { op: Op; value: number; value2?: number } | null {
  let m =
    s.match(new RegExp(String.raw`\bbetween\s+${NUM}\s*%?\s+(?:and|to|-)\s*${NUM}`)) ||
    s.match(new RegExp(String.raw`\b(?:in the range(?: of)?\s+|from\s+)?${NUM}\s*%?\s*(?:to|-)\s*${NUM}\b`));
  if (m) {
    const a = toNum(m[1]);
    const b = toNum(m[2]);
    return { op: "between", value: Math.min(a, b), value2: Math.max(a, b) };
  }

  // value-first: "100 or more", "30 or less"
  m = s.match(new RegExp(String.raw`${NUM}\s*%?\s*(?:\+|or (?:more|higher|above|greater))`));
  if (m) return { op: "gte", value: toNum(m[1]) };
  m = s.match(new RegExp(String.raw`${NUM}\s*%?\s*or (?:less|lower|below|under|fewer)`));
  if (m) return { op: "lte", value: toNum(m[1]) };

  // operator-first (order matters: >= before >, <= before <)
  const OPS: [string, Op][] = [
    [String.raw`(?:>=|at least|no less than|min(?:imum)?|not (?:less|lower|below)|>\s*=)`, "gte"],
    [String.raw`(?:<=|at most|no more than|max(?:imum)?|not (?:more|greater|above)|up to|within|<\s*=)`, "lte"],
    [String.raw`(?:>|above|over|greater than|more than|higher than|exceed(?:s|ing)?|beyond|north of)`, "gt"],
    [String.raw`(?:<|below|under|less than|lower than|beneath|south of)`, "lt"],
    [String.raw`(?:==|=|equals?|is exactly|exactly|is)`, "eq"],
  ];
  for (const [pat, op] of OPS) {
    const mm = s.match(new RegExp(pat + String.raw`\s*(?:₹|rs\.?|inr)?\s*` + NUM));
    if (mm) return { op, value: toNum(mm[1]) };
  }
  return null;
}

// share-count units → absolute shares; market-cap units → ₹ crore (base unit)
function scaleShares(c: string, v: number): number {
  if (/\bcr\b/.test(c)) return v * 1e7;
  if (/\blakh\b/.test(c)) return v * 1e5;
  if (/\b(?:m|mn|million)\b/.test(c)) return v * 1e6;
  if (/\b(?:k|thousand)\b/.test(c)) return v * 1e3;
  return v;
}
function scaleCap(c: string, v: number): number {
  if (/\blakh\s*cr\b/.test(c) || /\btrillion\b/.test(c)) return v * 1e5;
  if (/\bthousand\s*cr\b/.test(c)) return v * 1e3;
  return v; // already in crore
}

function tfOf(s: string): "d" | "w" | "m" {
  if (/\b(?:month(?:ly)?|mth|1m)\b/.test(s)) return "m";
  if (/\b(?:week(?:ly)?|wk|1w)\b/.test(s)) return "w";
  return "d";
}

// exact idioms → a signal flag (=1)
const SIGNALS: [RegExp, string, string][] = [
  [/\bgolden\s*cross(?:over)?\b/, "golden_cross", "Golden cross"],
  [/\bdeath\s*cross(?:over)?\b/, "death_cross", "Death cross"],
  [/\b20\s*(?:d?ma|sma|ema)?\s*(?:crossing|cross(?:es|ed|ing)?|above|over)\s*50\b/, "cross_20_50_up", "20 crossed above 50"],
  [/\b20\s*(?:d?ma|sma|ema)?\s*(?:below|under|down|crossing below)\s*50\b/, "cross_20_50_down", "20 crossed below 50"],
  [/\bgap(?:s|ped|ping)?\s*(?:up|higher)\b/, "gap_up", "Gap up"],
  [/\bgap(?:s|ped|ping)?\s*(?:down|lower)\b/, "gap_down", "Gap down"],
  [/\b(?:volume\s*spike|unusual\s*volume|high\s*volume|volume\s*surge|heavy\s*volume)\b/, "volume_spike", "Volume spike"],
  [/\bmacd\b[^,]*\b(?:bullish|cross(?:es|ed)?\s*up|turned?\s*positive|positive\s*cross)\b|\bbullish\s*macd\b/, "macd_bull_cross", "MACD bullish cross"],
  [/\bmacd\b[^,]*\b(?:bearish|cross(?:es|ed)?\s*down|turned?\s*negative|negative\s*cross)\b|\bbearish\s*macd\b/, "macd_bear_cross", "MACD bearish cross"],
];

// numeric fields where the number is a genuine threshold (not a period/level)
const FIELDS: { re: RegExp; key: string; scale?: (c: string, v: number) => number }[] = [
  { re: /\brsi\b/, key: "rsi_14" },
  { re: /\b(?:atr|average true range|volatility)\b/, key: "atr_pct" },
  { re: /\bmacd\b/, key: "macd_hist" },
  { re: /\b(?:rel(?:ative)?\s*vol(?:ume)?|rvol)\b/, key: "rel_volume" },
  { re: /\b(?:market\s*cap|mcap|m\s*cap|market capitali[sz]ation)\b/, key: "market_cap_cr", scale: scaleCap },
  { re: /\b(?:volume|vol|traded (?:qty|quantity|volume)|turnover)\b/, key: "volume", scale: scaleShares },
  { re: /\b(?:price|ltp|cmp|close|last (?:traded )?price|trading|quote)\b/, key: "close" },
  { re: /\b(?:change|1d change|day(?:'s)? change|daily change|% change)\b/, key: "change_pct" },
];

// Resolve ALL conditions expressed in one clause (deduped by field), so
// "mid cap stocks above 50 dma" yields both the cap tier and the MA filter.
function matchClause(clause: string): Match[] {
  const c = ` ${clause.trim()} `;
  const out: Match[] = [];
  const used = new Set<string>();
  const add = (f: Filter, label?: string) => {
    if (used.has(f.field)) return;
    used.add(f.field);
    out.push(one(f, label));
  };

  // 1) signal-flag idioms (a clause may carry several)
  for (const [re, key, label] of SIGNALS) if (re.test(c)) add({ field: key, op: "eq", value: 1 }, label);

  // 1b) MACD polarity (positive/negative histogram), unless a cross already matched
  if (/\bmacd\b/.test(c) && !used.has("macd_bull_cross") && !used.has("macd_bear_cross")) {
    if (/\b(?:positive|above (?:zero|0))\b/.test(c)) add({ field: "macd_hist", op: "gt", value: 0 }, "MACD positive");
    else if (/\b(?:negative|below (?:zero|0))\b/.test(c)) add({ field: "macd_hist", op: "lt", value: 0 }, "MACD negative");
  }

  // 2) new highs/lows & breakouts
  if (/\b(?:new|fresh|all[\s-]*time|record|breaking|breakout)\b[^,]*\bhigh\b/.test(c) && !/\bvolume\b/.test(c))
    add({ field: "new_high_52w", op: "eq", value: 1 }, "New 52-week high");
  else if (/\bbreak(?:ing)?\s*out\b|\bbreakout\b/.test(c)) add({ field: "new_high_52w", op: "eq", value: 1 }, "Breakout (new high)");
  if (/\b(?:new|fresh|all[\s-]*time|record|breaking|breakdown)\b[^,]*\blow\b/.test(c))
    add({ field: "new_low_52w", op: "eq", value: 1 }, "New 52-week low");
  else if (/\bbreak(?:ing)?\s*down\b|\bbreakdown\b/.test(c)) add({ field: "new_low_52w", op: "eq", value: 1 }, "Breakdown (new low)");

  // 3) momentum shorthands
  if (/\boversold\b/.test(c)) add({ field: "rsi_14", op: "lt", value: 30 }, "Oversold (RSI < 30)");
  else if (/\boverbought\b/.test(c)) add({ field: "rsi_14", op: "gt", value: 70 }, "Overbought (RSI > 70)");

  // 4) market-cap tiers
  if (/\bmega[\s-]*cap\b/.test(c)) add({ field: "market_cap_cr", op: "gt", value: 100000 }, "Mega cap");
  else if (/\blarge[\s-]*cap\b/.test(c)) add({ field: "market_cap_cr", op: "gt", value: 20000 }, "Large cap");
  else if (/\bmid[\s-]*cap\b/.test(c)) add({ field: "market_cap_cr", op: "between", value: 5000, value2: 20000 }, "Mid cap");
  else if (/\bsmall[\s-]*cap\b/.test(c)) add({ field: "market_cap_cr", op: "between", value: 500, value2: 5000 }, "Small cap");
  else if (/\bmicro[\s-]*cap\b/.test(c)) add({ field: "market_cap_cr", op: "lt", value: 500 }, "Micro cap");

  // 5) day change (up/down N%)
  if (!/\bdma\b|\bsma\b|\bema\b|\bsupport\b|\bresist/.test(c)) {
    let m = c.match(new RegExp(String.raw`\b(?:up|gain(?:ed|ing|ers)?|rose|rising|advanc\w+)\b(?:\s+(?:by|more than|over|at least|around|about))?\s*${NUM}\s*%?`));
    if (m) add({ field: "change_pct", op: "gt", value: toNum(m[1]) });
    else {
      m = c.match(new RegExp(String.raw`\b(?:down|fell|fall(?:ing)?|declin\w+|dropp?\w+|lost|los(?:ers|ing))\b(?:\s+(?:by|more than|over|at least|around|about))?\s*${NUM}\s*%?`));
      if (m) add({ field: "change_pct", op: "lt", value: -toNum(m[1]) });
    }
  }

  // 6) N× (relative) volume
  const rv = c.match(new RegExp(String.raw`${NUM}\s*(?:x|times)\s*(?:the\s*)?(?:average\s*|avg\s*|20[\s-]*day\s*)?(?:rel(?:ative)?\s*)?vol(?:ume)?`));
  if (rv) add({ field: "rel_volume", op: "gte", value: toNum(rv[1]) }, `Rel volume ≥ ${toNum(rv[1])}`);

  // 7) support / resistance (daily / weekly / monthly)
  if (/\bsupport\b|\bresist(?:ance)?\b/.test(c)) {
    const isRes = /\bresist/.test(c);
    const key = `${isRes ? "dist_res_" : "dist_sup_"}${tfOf(c)}_pct`;
    const within = c.match(new RegExp(String.raw`within\s+${NUM}\s*%?\s*(?:of|from|to)?`));
    if (within) {
      const n = Math.abs(toNum(within[1]));
      add(isRes ? { field: key, op: "between", value: -n, value2: 0 } : { field: key, op: "between", value: 0, value2: n });
    } else {
      const cmp = parseCmp(c);
      if (cmp) add({ field: key, ...cmp });
      else add(
        isRes ? { field: key, op: "between", value: -3, value2: 0 } : { field: key, op: "between", value: 0, value2: 3 },
        `${isRes ? "Near resistance" : "Near support"} (${tfOf(c).toUpperCase()})`,
      );
    }
  }

  // 8) 52-week range (near / within / explicit %). Skip if already a "new high/low".
  const yr = /\b(?:52|one year|1 year|year(?:ly)?)\b/;
  const near = /\b(?:near|close to|approaching|from|off)\b/;
  if (/\bhigh\b/.test(c) && (yr.test(c) || near.test(c)) && !/\bvolume\b/.test(c) && !used.has("new_high_52w")) {
    const w = c.match(new RegExp(String.raw`within\s+${NUM}\s*%?`));
    if (w) add({ field: "dist_52w_high_pct", op: "between", value: -Math.abs(toNum(w[1])), value2: 0 });
    else {
      const cmp = parseCmp(c);
      add(cmp ? { field: "dist_52w_high_pct", ...cmp } : { field: "dist_52w_high_pct", op: "between", value: -5, value2: 0 }, cmp ? undefined : "Near 52w high");
    }
  }
  if (/\blow\b/.test(c) && (yr.test(c) || near.test(c)) && !used.has("new_low_52w")) {
    const w = c.match(new RegExp(String.raw`within\s+${NUM}\s*%?`));
    if (w) add({ field: "dist_52w_low_pct", op: "between", value: 0, value2: Math.abs(toNum(w[1])) });
    else {
      const cmp = parseCmp(c);
      add(cmp ? { field: "dist_52w_low_pct", ...cmp } : { field: "dist_52w_low_pct", op: "between", value: 0, value2: 5 }, cmp ? undefined : "Near 52w low");
    }
  }

  // 9) price vs a moving average (20 / 50 / 200)
  const sm = c.match(/\b(20|50|200)\s*(?:d?ma|sma|ema|ma|day (?:moving )?average|moving average)\b/);
  if (sm) {
    const key = `pct_above_sma${sm[1]}`;
    const pm = c.match(new RegExp(String.raw`${NUM}\s*%\s*(above|below|over|under)`));
    if (pm) add({ field: key, op: /below|under/.test(pm[2]) ? "lt" : "gt", value: toNum(pm[1]) });
    else if (/\b(?:below|under|lower than|beneath)\b/.test(c)) add({ field: key, op: "lt", value: 0 }, `Below ${sm[1]} DMA`);
    else add({ field: key, op: "gt", value: 0 }, `Above ${sm[1]} DMA`);
  }

  // 10) generic: the FIRST known field + a comparator (only one, so the
  // comparator isn't mis-bound to a second field in the same clause).
  for (const fld of FIELDS) {
    if (used.has(fld.key)) continue;
    if (!fld.re.test(c)) continue;
    const cmp = parseCmp(c);
    if (!cmp) continue;
    add({
      field: fld.key,
      op: cmp.op,
      value: fld.scale ? fld.scale(c, cmp.value) : cmp.value,
      ...(cmp.value2 !== undefined ? { value2: fld.scale ? fld.scale(c, cmp.value2) : cmp.value2 } : {}),
    });
    break;
  }

  return out;
}

// strip framing words so a clause with nothing screenable isn't flagged as ignored
const FILLER = /\b(?:show|find|scan|list|get|give|me|us|please|stocks?|shares?|scrips?|companies|names?|that|which|are|is|be|with|where|having|have|the|a|an|all|any|of|for|in|on|and|or|to|near|at)\b/g;

export function parseScreen(text: string): ParsedScreen {
  const norm = normalize(text);
  const logic: Logic = /\b(?:or|any of|either)\b/.test(norm) ? "OR" : "AND";

  // segment hints (checked on the whole string)
  let segments: string[] | null = null;
  const recognized: string[] = [];
  if (/\b(?:no\s*etf|exclude\s*etf|equity\s*only|stocks?\s*only|only\s*stocks?)\b/.test(norm)) {
    segments = ["EQ"];
    recognized.push("Equity only (exclude ETFs)");
  } else if (/\b(?:etf\s*only|only\s*etfs?|just\s*etfs?)\b/.test(norm)) {
    segments = ["ETF"];
    recognized.push("ETFs only");
  }

  // Protect "between A and B" so splitting on "and"/"or" doesn't break the range.
  const protectedText = norm.replace(
    new RegExp(String.raw`\bbetween\s+${NUM}\s*(%?)\s+and\s+`, "g"),
    "between $1$2 to ",
  );
  const clauses = protectedText
    .split(/\s*(?:,|;|\/|&|\band\b|\bor\b|\bwith\b|\bplus\b|\bthen\b|\bhaving\b)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const filters: Filter[] = [];
  const seen = new Set<string>();
  const unrecognized: string[] = [];

  for (const clause of clauses) {
    const hits = matchClause(clause);
    if (!hits.length) {
      // segment phrases are applied globally above — don't flag them as ignored
      if (/\b(?:etf|equity only|stocks? only|only stocks?|exclude etf|no etf)\b/.test(clause)) continue;
      const meaningful = clause.replace(FILLER, "").replace(/[^a-z0-9]+/g, " ").trim();
      if (meaningful.length > 1) unrecognized.push(clause.trim());
      continue;
    }
    for (const hit of hits) {
      for (const f of hit.filters) {
        const k = `${f.field}:${f.op}:${f.value}`;
        if (seen.has(k)) continue;
        seen.add(k);
        filters.push(f);
      }
      recognized.push(hit.label);
    }
  }

  return {
    filters,
    logic,
    segments,
    recognized,
    unrecognized,
    matchedAny: filters.length > 0 || segments !== null,
  };
}
