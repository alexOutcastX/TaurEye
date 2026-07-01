export type Exchange = "NSE" | "BSE";
export type Operator = "gt" | "gte" | "lt" | "lte" | "eq" | "between";
export type Logic = "AND" | "OR";

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  type: "number";
  unit?: string | null;
  desc?: string | null;
}

export interface Metrics {
  symbol: string;
  name: string;
  exchange: Exchange;
  sector: string;
  close: number;
  change_pct: number;
  change_abs: number;
  volume: number;
  rel_volume: number;
  rsi_14: number | null;
  macd_hist: number | null;
  sma_20: number;
  sma_50: number;
  sma_200: number;
  pct_above_sma20: number;
  pct_above_sma50: number;
  pct_above_sma200: number;
  dist_52w_high_pct: number;
  dist_52w_low_pct: number;
  // Nearest support/resistance distance per timeframe (D/W/M). Support >= 0
  // (price above support), resistance <= 0 (price below resistance).
  dist_sup_d_pct?: number;
  dist_res_d_pct?: number;
  dist_sup_w_pct?: number;
  dist_res_w_pct?: number;
  dist_sup_m_pct?: number;
  dist_res_m_pct?: number;
  atr_pct: number;
  market_cap_cr: number | null;
  segment?: string | null;
  // Condition Catalog signal flags (1/0)
  golden_cross?: number;
  death_cross?: number;
  cross_20_50_up?: number;
  cross_20_50_down?: number;
  new_high_52w?: number;
  new_low_52w?: number;
  macd_bull_cross?: number;
  macd_bear_cross?: number;
  gap_up?: number;
  gap_down?: number;
  volume_spike?: number;
}

export interface SegmentInfo {
  key: string;
  label: string;
  count: number;
}

export interface IndexQuote {
  key: string;
  label: string;
  value: number | null;
  change_pct: number | null;
  // Optional grouping for the Indices/Forex/DR page (added by the exporter).
  category?: "domestic" | "international" | "currency" | "depository" | null;
  country?: string | null;
  // EOD / last-update date for THIS instrument's own market ("YYYY-MM-DD").
  // Lets each tab show its own "last updated" (markets close at different times).
  data_date?: string | null;
}

export interface IndicesResponse {
  indices: IndexQuote[];
  as_of: string;
  data_date: string | null;
  // When the offline data bundle was published (set by `taureye export`).
  // Absent on the live backend, where `data_date` is the freshness signal.
  generated_at?: string | null;
}

export interface Security {
  symbol: string;
  name: string;
  exchange: Exchange;
  sector: string;
  isin: string;
  shares_outstanding?: number | null;
  segment?: string | null;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Filter {
  field: string;
  op: Operator;
  value: number;
  // Upper bound for `op:"between"`, AND the second value when `join` is set.
  value2?: number | null;
  // Optional SECOND condition on the same field, combined with the first by
  // `join`. e.g. Price >100 AND <2000, or RSI <30 OR >70. null/absent = single.
  join?: Logic | null;
  op2?: Operator;
}

export interface ScreenRequest {
  filters: Filter[];
  logic: Logic;
  exchange?: Exchange | null;
  segments?: string[] | null;
  query?: string | null;
  sort_by: string;
  sort_dir: "asc" | "desc";
  limit: number;
}

export interface ScreenResponse {
  count: number;
  total_universe: number;
  results: Metrics[];
}

export interface SavedScreen {
  id: string;
  name: string;
  request: ScreenRequest;
  created_at: string;
}
