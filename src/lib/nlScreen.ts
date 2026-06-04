import type { Filter, Logic } from "../api/types";

/**
 * Local, rule-based natural-language → screen translator.
 *
 * Maps plain-English strategy phrases ("golden crossover", "20 dma crossing 50",
 * "rsi below 30 and above 200 dma") to the screener's filter schema, constrained
 * to the known Condition Catalog. Deterministic and offline — an LLM can be
 * layered on later for fuzzier phrasing, emitting the same filter shape.
 */
export interface ParsedScreen {
  filters: Filter[];
  logic: Logic;
  segments: string[] | null;
  recognized: string[]; // human-readable list of what matched
  matchedAny: boolean;
}

type Rule = {
  re: RegExp;
  label: string;
  build: (m: RegExpMatchArray) => Filter | null;
};

const num = (s: string) => parseFloat(s.replace(/,/g, ""));

const RULES: Rule[] = [
  // crossovers / signals
  { re: /\bgolden\s*cross(over)?\b/, label: "Golden cross", build: () => ({ field: "golden_cross", op: "eq", value: 1 }) },
  { re: /\bdeath\s*cross(over)?\b/, label: "Death cross", build: () => ({ field: "death_cross", op: "eq", value: 1 }) },
  { re: /\b20\s*(d?ma|sma)?\s*(crossing|cross|above|over)\s*50\b/, label: "20 SMA crossing above 50", build: () => ({ field: "cross_20_50_up", op: "eq", value: 1 }) },
  { re: /\b20\s*(d?ma|sma)?\s*(below|under|down)\s*50\b/, label: "20 SMA crossing below 50", build: () => ({ field: "cross_20_50_down", op: "eq", value: 1 }) },
  { re: /\b(new\s*)?52[\s-]*week\s*high\b|\bnew\s*high\b|\b52w?\s*high\b/, label: "New 52-week high", build: () => ({ field: "new_high_52w", op: "eq", value: 1 }) },
  { re: /\b(new\s*)?52[\s-]*week\s*low\b|\bnew\s*low\b|\b52w?\s*low\b/, label: "New 52-week low", build: () => ({ field: "new_low_52w", op: "eq", value: 1 }) },
  { re: /\bmacd\b.*\b(bullish|cross\s*up|positive)\b|\bbullish\s*macd\b/, label: "MACD bullish cross", build: () => ({ field: "macd_bull_cross", op: "eq", value: 1 }) },
  { re: /\bmacd\b.*\b(bearish|cross\s*down|negative)\b|\bbearish\s*macd\b/, label: "MACD bearish cross", build: () => ({ field: "macd_bear_cross", op: "eq", value: 1 }) },
  { re: /\bgap\s*up\b/, label: "Gap up", build: () => ({ field: "gap_up", op: "eq", value: 1 }) },
  { re: /\bgap\s*down\b/, label: "Gap down", build: () => ({ field: "gap_down", op: "eq", value: 1 }) },
  { re: /\b(volume\s*spike|high\s*volume|unusual\s*volume|\d+\s*x\s*volume)\b/, label: "Volume spike (≥2× avg)", build: () => ({ field: "volume_spike", op: "eq", value: 1 }) },

  // RSI
  { re: /\brsi\s*(below|under|less than|<)\s*(\d+(?:\.\d+)?)/, label: "RSI below N", build: (m) => ({ field: "rsi_14", op: "lt", value: num(m[2]) }) },
  { re: /\brsi\s*(above|over|greater than|>)\s*(\d+(?:\.\d+)?)/, label: "RSI above N", build: (m) => ({ field: "rsi_14", op: "gt", value: num(m[2]) }) },
  { re: /\boversold\b/, label: "Oversold (RSI < 30)", build: () => ({ field: "rsi_14", op: "lt", value: 30 }) },
  { re: /\boverbought\b/, label: "Overbought (RSI > 70)", build: () => ({ field: "rsi_14", op: "gt", value: 70 }) },

  // price vs moving averages
  { re: /\b(above|over)\s*200\s*(d?ma|sma)?\b/, label: "Above 200 DMA", build: () => ({ field: "pct_above_sma200", op: "gt", value: 0 }) },
  { re: /\b(below|under)\s*200\s*(d?ma|sma)?\b/, label: "Below 200 DMA", build: () => ({ field: "pct_above_sma200", op: "lt", value: 0 }) },
  { re: /\b(above|over)\s*50\s*(d?ma|sma)\b/, label: "Above 50 DMA", build: () => ({ field: "pct_above_sma50", op: "gt", value: 0 }) },
  { re: /\b(below|under)\s*50\s*(d?ma|sma)\b/, label: "Below 50 DMA", build: () => ({ field: "pct_above_sma50", op: "lt", value: 0 }) },
  { re: /\b(above|over)\s*20\s*(d?ma|sma)\b/, label: "Above 20 DMA", build: () => ({ field: "pct_above_sma20", op: "gt", value: 0 }) },

  // price / change / market cap
  { re: /\b(price|ltp)\s*(above|over|>)\s*(\d[\d,]*)/, label: "Price above N", build: (m) => ({ field: "close", op: "gt", value: num(m[3]) }) },
  { re: /\b(price|ltp)\s*(below|under|<)\s*(\d[\d,]*)/, label: "Price below N", build: (m) => ({ field: "close", op: "lt", value: num(m[3]) }) },
  { re: /\b(up|gain(ers)?)\s*(more than\s*)?(\d+(?:\.\d+)?)\s*%/, label: "Up more than N%", build: (m) => ({ field: "change_pct", op: "gt", value: num(m[4]) }) },
  { re: /\b(down|los(ers|t|ing)?)\s*(more than\s*)?(\d+(?:\.\d+)?)\s*%/, label: "Down more than N%", build: (m) => ({ field: "change_pct", op: "lt", value: -num(m[4]) }) },
  { re: /\blarge[\s-]*cap\b/, label: "Large cap (> ₹20,000 cr)", build: () => ({ field: "market_cap_cr", op: "gt", value: 20000 }) },
  { re: /\bmid[\s-]*cap\b/, label: "Mid cap (₹5,000–20,000 cr)", build: () => ({ field: "market_cap_cr", op: "gte", value: 5000 }) },
  { re: /\bsmall[\s-]*cap\b/, label: "Small cap (< ₹5,000 cr)", build: () => ({ field: "market_cap_cr", op: "lt", value: 5000 }) },
  { re: /\bmarket\s*cap\s*(above|over|>)\s*(\d[\d,]*)/, label: "Market cap above N cr", build: (m) => ({ field: "market_cap_cr", op: "gt", value: num(m[2]) }) },
];

export function parseScreen(text: string): ParsedScreen {
  const t = " " + text.toLowerCase().trim() + " ";
  const filters: Filter[] = [];
  const recognized: string[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (!m) continue;
    const f = rule.build(m);
    if (!f) continue;
    const key = `${f.field}:${f.op}`;
    if (seen.has(key)) continue; // first match per field+op wins
    seen.add(key);
    filters.push(f);
    recognized.push(rule.label);
  }

  // segment hints
  let segments: string[] | null = null;
  if (/\b(no\s*etf|exclude\s*etf|equity\s*only|stocks?\s*only)\b/.test(t)) {
    segments = ["EQ"];
    recognized.push("Equity only (exclude ETFs)");
  }

  const logic: Logic = /\b(any of|or )\b/.test(t) ? "OR" : "AND";

  return { filters, logic, segments, recognized, matchedAny: filters.length > 0 || segments !== null };
}
