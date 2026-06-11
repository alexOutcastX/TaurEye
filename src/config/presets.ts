// Preset scan library — curated, ready-to-run screens.
//
// COMPLIANCE: every preset is a FACTUAL CONDITION (what the data shows), never a
// recommendation. Names must describe the filter ("Above 200-DMA"), not an
// outcome or action ("stocks to buy"). Results are just "stocks matching this
// filter" — the screener's standard disclaimer applies.

import type { ScreenRequest } from "../api/types";

export interface Preset {
  id: string;
  name: string;
  desc: string;
  group: "Trend" | "Momentum" | "Breakouts" | "Volume" | "Value range";
  request: ScreenRequest;
}

const base = {
  logic: "AND" as const,
  exchange: null,
  query: "",
  sort_by: "market_cap_cr",
  sort_dir: "desc" as const,
  limit: 100,
};

export const PRESETS: Preset[] = [
  // ---- Trend ----
  {
    id: "above-200dma",
    name: "Above 200-DMA",
    desc: "Closing price above the 200-day moving average",
    group: "Trend",
    request: { ...base, filters: [{ field: "pct_above_sma200", op: "gt", value: 0 }] },
  },
  {
    id: "golden-cross",
    name: "Golden cross today",
    desc: "50-DMA crossed above the 200-DMA on the latest close",
    group: "Trend",
    request: { ...base, filters: [{ field: "golden_cross", op: "eq", value: 1 }] },
  },
  {
    id: "death-cross",
    name: "Death cross today",
    desc: "50-DMA crossed below the 200-DMA on the latest close",
    group: "Trend",
    request: { ...base, filters: [{ field: "death_cross", op: "eq", value: 1 }] },
  },
  {
    id: "above-all-dmas",
    name: "Above 20/50/200-DMA",
    desc: "Price above all three moving averages",
    group: "Trend",
    request: {
      ...base,
      filters: [
        { field: "pct_above_sma20", op: "gt", value: 0 },
        { field: "pct_above_sma50", op: "gt", value: 0 },
        { field: "pct_above_sma200", op: "gt", value: 0 },
      ],
    },
  },
  // ---- Momentum ----
  {
    id: "rsi-oversold",
    name: "RSI below 30",
    desc: "14-day RSI in the oversold zone",
    group: "Momentum",
    request: { ...base, filters: [{ field: "rsi_14", op: "lt", value: 30 }] },
  },
  {
    id: "rsi-overbought",
    name: "RSI above 70",
    desc: "14-day RSI in the overbought zone",
    group: "Momentum",
    request: { ...base, filters: [{ field: "rsi_14", op: "gt", value: 70 }] },
  },
  {
    id: "macd-bull-cross",
    name: "MACD bullish cross",
    desc: "MACD line crossed above its signal line on the latest close",
    group: "Momentum",
    request: { ...base, filters: [{ field: "macd_bull_cross", op: "eq", value: 1 }] },
  },
  {
    id: "up3-2x-volume",
    name: "Up 3%+ on 2× volume",
    desc: "Day change above +3% with volume at least twice the average",
    group: "Momentum",
    request: {
      ...base,
      filters: [
        { field: "change_pct", op: "gt", value: 3 },
        { field: "rel_volume", op: "gt", value: 2 },
      ],
    },
  },
  // ---- Breakouts ----
  {
    id: "new-52w-high",
    name: "New 52-week high",
    desc: "Made a fresh 52-week high on the latest close",
    group: "Breakouts",
    request: { ...base, filters: [{ field: "new_high_52w", op: "eq", value: 1 }] },
  },
  {
    id: "near-52w-high",
    name: "Within 5% of 52-week high",
    desc: "Closing price within 5% of the 52-week high",
    group: "Breakouts",
    request: { ...base, filters: [{ field: "dist_52w_high_pct", op: "gte", value: -5 }] },
  },
  {
    id: "gap-up",
    name: "Gapped up today",
    desc: "Opened above the previous day's high",
    group: "Breakouts",
    request: { ...base, filters: [{ field: "gap_up", op: "eq", value: 1 }] },
  },
  {
    id: "new-52w-low",
    name: "New 52-week low",
    desc: "Made a fresh 52-week low on the latest close",
    group: "Breakouts",
    request: { ...base, filters: [{ field: "new_low_52w", op: "eq", value: 1 }] },
  },
  // ---- Volume ----
  {
    id: "volume-spike",
    name: "Volume spike",
    desc: "Today's volume far above its recent average",
    group: "Volume",
    request: { ...base, filters: [{ field: "volume_spike", op: "eq", value: 1 }] },
  },
  {
    id: "3x-rel-volume",
    name: "3× relative volume",
    desc: "Volume at least three times the 20-day average",
    group: "Volume",
    request: { ...base, filters: [{ field: "rel_volume", op: "gte", value: 3 }] },
  },
  // ---- Value range ----
  {
    id: "largecap-uptrend",
    name: "Large caps above 50-DMA",
    desc: "Market cap above ₹20,000 cr and price above the 50-day average",
    group: "Value range",
    request: {
      ...base,
      filters: [
        { field: "market_cap_cr", op: "gt", value: 20000 },
        { field: "pct_above_sma50", op: "gt", value: 0 },
      ],
    },
  },
  {
    id: "low-volatility",
    name: "Low volatility (ATR < 2%)",
    desc: "Average true range under 2% of price",
    group: "Value range",
    request: { ...base, filters: [{ field: "atr_pct", op: "lt", value: 2 }] },
  },
];
