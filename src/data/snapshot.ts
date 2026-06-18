// Reads the precomputed JSON bundle published by `taureye export` and serves the
// app's read endpoints from it — no backend needed. The big EOD spine never
// ships to the device; the screener runs off metrics.json (~0.5 MB gz) and
// charts lazy-load per-symbol candle files on demand.
//
// Used only when LOCAL_DATA is on (see api/client.ts). Files are fetched from
// DATA_BASE (a CDN/host, or the app's own public/data/). Each file is cached for
// the session after first load.

import type {
  Candle,
  FieldDef,
  IndicesResponse,
  Metrics,
  ScreenRequest,
  ScreenResponse,
  Security,
  SegmentInfo,
} from "../api/types";
import { bundledUrl, candleUrl, dataUrl } from "./source";
import { runScreen } from "../lib/screenLocal";

// ---- bundle file shapes (as written by backend/app/dataengine/export.py) ----

interface MetricsBundle {
  meta: { generated_at: string; count: number };
  fields: FieldDef[];
  segments: SegmentInfo[];
  metrics: Metrics[];
}

interface FundamentalRow {
  s: string; // symbol
  n: string; // name
  x: "NSE" | "BSE"; // primary exchange
  sec: string; // sector
  g: string | null; // segment
  fv: number | null; // face value
  so: number | null; // shares outstanding
  isin: string;
}

interface FundamentalsBundle {
  meta: { generated_at: string; count: number };
  securities: FundamentalRow[];
}

interface CandleFile {
  s: string;
  adjusted: boolean;
  cols: string[]; // ["date","o","h","l","c","v"]
  candles: Array<[string, number, number, number, number, number]>;
}

// ---- session caches (one fetch per file) -----------------------------------

let metricsCache: Promise<MetricsBundle> | null = null;
let fundamentalsCache: Promise<FundamentalsBundle> | null = null;
let dividendsCache: Promise<Map<string, DividendEvent[]>> | null = null;
const candleCache = new Map<string, Promise<Candle[]>>();

export interface DividendEvent {
  date: string; // ex-date (ISO)
  amount: number; // ₹ per share
}

/** Per-symbol cash dividends, for portfolio total-return. Optional file: absent
 *  until a refresh publishes it -> empty map (fail-soft, never throws). */
export function localDividends(): Promise<Map<string, DividendEvent[]>> {
  if (!dividendsCache) {
    dividendsCache = (async () => {
      type Raw = { dividends?: Record<string, [string, number][]> };
      const data =
        (await tryFetch<Raw>(dataUrl("dividends.json"))) ??
        (await tryFetch<Raw>(bundledUrl("dividends.json")));
      const map = new Map<string, DividendEvent[]>();
      for (const [sym, arr] of Object.entries(data?.dividends ?? {})) {
        map.set(sym, (arr || []).map(([date, amount]) => ({ date, amount })));
      }
      return map;
    })();
  }
  return dividendsCache;
}

export interface StockReport {
  text: string;
  disclaimer?: string;
  generated_at?: string;
}

const reportCache = new Map<string, Promise<StockReport | null>>();

/** Pre-generated templated report for a symbol (nightly, ₹0). null if not
 *  published for this symbol — the caller falls back to the live AI function. */
export function localStockReport(symbol: string): Promise<StockReport | null> {
  let p = reportCache.get(symbol);
  if (!p) {
    p = tryFetch<StockReport>(dataUrl(`reports/${encodeURIComponent(symbol)}.json`));
    reportCache.set(symbol, p);
  }
  return p;
}

async function tryFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchJSON<T>(
  url: string,
  label: string,
  hint: string,
  fallbackUrl?: string,
): Promise<T> {
  // Try the (possibly remote) source first so the app auto-updates from the host.
  const primary = await tryFetch<T>(url);
  if (primary !== null) return primary;
  // Then the in-app bundled copy, so a missing/unreachable host degrades to the
  // last shipped snapshot rather than failing outright.
  if (fallbackUrl && fallbackUrl !== url) {
    const fallback = await tryFetch<T>(fallbackUrl);
    if (fallback !== null) return fallback;
  }
  throw new Error(`Could not load ${label}. ${hint}`);
}

// Bundle files: fetch fresh from the host, fall back to the in-app copy offline.
async function getJSON<T>(name: string, hint: string): Promise<T> {
  return fetchJSON<T>(dataUrl(name), name, hint, bundledUrl(name));
}

function loadMetrics(): Promise<MetricsBundle> {
  if (!metricsCache) {
    // Cache the promise so each file is fetched once per session — but if it
    // rejects, drop the cache so a later retry (e.g. the loading screen's Retry
    // button) can fetch again instead of replaying the failed promise forever.
    metricsCache = getJSON<MetricsBundle>(
      "metrics.json",
      "Run `taureye export` and (re)deploy the data bundle.",
    )
      .then((s) => {
        // Defensive de-dup: drop any repeated symbol+exchange rows from the
        // bundle. Duplicates hide in the default order but cluster together once
        // you sort (e.g. by % change), showing up as doubled screener rows.
        const seen = new Set<string>();
        s.metrics = s.metrics.filter((m) => {
          const k = `${m.symbol}|${m.exchange}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        return s;
      })
      .catch((e) => {
        metricsCache = null;
        throw e;
      });
  }
  return metricsCache;
}

function loadFundamentals(): Promise<FundamentalsBundle> {
  if (!fundamentalsCache) {
    fundamentalsCache = getJSON<FundamentalsBundle>(
      "fundamentals.json",
      "Run `taureye export` and (re)deploy the data bundle.",
    ).catch((e) => {
      fundamentalsCache = null;
      throw e;
    });
  }
  return fundamentalsCache;
}

// ---- extra lookups for the report view --------------------------------------

/** When the published data bundle was generated (the "data as of" stamp). */
export async function localDataInfo(): Promise<{ generated_at: string | null }> {
  try {
    const s = await loadMetrics();
    return { generated_at: s.meta?.generated_at ?? null };
  } catch {
    return { generated_at: null };
  }
}

/** Market-cap classification by AMFI-style rank over the whole universe:
 *  1–100 Large Cap, 101–250 Mid Cap, 251–500 Small Cap, 501+ Micro Cap. */
export async function localCapSegment(
  symbol: string,
): Promise<{ segment: string; rank: number } | null> {
  try {
    const s = await loadMetrics();
    const ranked = s.metrics
      .filter((x) => x.market_cap_cr != null && x.market_cap_cr > 0)
      .sort((a, b) => (b.market_cap_cr ?? 0) - (a.market_cap_cr ?? 0));
    const rank = ranked.findIndex((x) => x.symbol === symbol) + 1;
    if (rank <= 0) return null;
    const segment =
      rank <= 100 ? "Large Cap" : rank <= 250 ? "Mid Cap" : rank <= 500 ? "Small Cap" : "Micro Cap";
    return { segment, rank };
  } catch {
    return null;
  }
}

/** Static security facts from fundamentals.json (face value, share count). */
export async function localSecurityInfo(
  symbol: string,
): Promise<{ face_value: number | null; shares_outstanding: number | null } | null> {
  try {
    const { securities } = await loadFundamentals();
    const r = securities.find((x) => x.s === symbol);
    return r ? { face_value: r.fv ?? null, shares_outstanding: r.so ?? null } : null;
  } catch {
    return null;
  }
}

// ---- api-compatible local implementations ----------------------------------

export async function localHealth(): Promise<{
  status: string;
  universe: number;
  provider: string;
}> {
  const s = await loadMetrics();
  return { status: "ok", universe: s.metrics.length, provider: "local" };
}

export async function localFields(): Promise<FieldDef[]> {
  return (await loadMetrics()).fields;
}

export async function localSegments(): Promise<SegmentInfo[]> {
  return (await loadMetrics()).segments;
}

export async function localScreen(req: ScreenRequest): Promise<ScreenResponse> {
  const s = await loadMetrics();
  return runScreen(s.metrics, s.fields, req);
}

export async function localMetrics(symbol: string): Promise<Metrics> {
  const s = await loadMetrics();
  const m = s.metrics.find((x) => x.symbol === symbol);
  if (!m) throw new Error("Unknown symbol");
  return m;
}

export async function localSearch(q: string, limit = 8): Promise<Security[]> {
  const query = q.trim().toUpperCase();
  if (!query) return [];
  const { securities } = await loadFundamentals();
  const hits: { sec: Security; rank: number }[] = [];
  for (const r of securities) {
    const sym = r.s.toUpperCase();
    const name = (r.n || "").toUpperCase();
    // rank 0 = symbol prefix, 1 = symbol contains, 2 = name contains
    let rank = -1;
    if (sym.startsWith(query)) rank = 0;
    else if (sym.includes(query)) rank = 1;
    else if (name.includes(query)) rank = 2;
    if (rank < 0) continue;
    hits.push({
      rank,
      sec: {
        symbol: r.s,
        name: r.n || r.s,
        exchange: r.x,
        sector: r.sec || "Unknown",
        isin: r.isin,
        shares_outstanding: r.so,
        segment: r.g,
      },
    });
  }
  hits.sort((a, b) => a.rank - b.rank || a.sec.symbol.localeCompare(b.sec.symbol));
  return hits.slice(0, Math.max(1, limit)).map((h) => h.sec);
}

export async function localCandles(symbol: string, limit = 260): Promise<Candle[]> {
  let p = candleCache.get(symbol);
  if (!p) {
    p = fetchJSON<CandleFile>(
      candleUrl(symbol),
      `candles/${symbol}.json`,
      "Charts stream per-symbol candle files from the data host — set VITE_CANDLE_BASE and publish them with `taureye export all`.",
    )
      .then((file) =>
        file.candles.map(([date, o, h, l, c, v]) => ({
          date,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v,
        })),
      )
      .catch((e) => {
        // Don't cache a failed fetch — let the next chart open retry it.
        candleCache.delete(symbol);
        throw e;
      });
    candleCache.set(symbol, p);
  }
  const all = await p;
  return limit > 0 && all.length > limit ? all.slice(all.length - limit) : all;
}

export async function localIndices(): Promise<IndicesResponse> {
  // Snapshot taken at export time; online builds refresh from the live feed.
  // Fail soft to an empty strip so a missing file never breaks the app.
  try {
    return await getJSON<IndicesResponse>("indices.json", "");
  } catch {
    return { indices: [], as_of: new Date().toISOString(), data_date: null };
  }
}
