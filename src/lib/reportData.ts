// Shared report-building flow used by the Chart page and the Watchlist so a
// "normal" (metrics-only) report and an AI report can be generated from anywhere
// without opening the chart. Keeps the corporate-actions fetch + AI-report call
// in one place (was previously inlined in Chart only).

import { api, aiReport } from "../api/client";
import { dataUrl } from "../data/source";
import { detectPatterns } from "./patterns";
import type { Metrics } from "../api/types";
import type { ReportData } from "../components/ReportView";

export interface CorpAction {
  ex_date: string;
  kind: string;
  ratio: number;
  detail?: string | null;
}

/** Corporate actions from the published funda/<SYMBOL>.json (null until exported). */
export async function fetchCorpActions(symbol: string): Promise<CorpAction[] | null> {
  try {
    const r = await fetch(dataUrl(`funda/${encodeURIComponent(symbol)}.json`));
    if (r.ok) return (await r.json()).corporate_actions ?? null;
  } catch {
    /* no funda file published yet — report degrades gracefully */
  }
  return null;
}

/** Detect chart patterns from the symbol's candles (best-effort; [] on failure). */
async function patternsFor(symbol: string): Promise<{ label: string; detail: string | null }[]> {
  try {
    const candles = await api.candles(symbol, 400);
    const bars = candles.map((c) => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    if (bars.length < 30) return [];
    return detectPatterns(bars).patterns.map((p) => ({ label: p.label, detail: p.detail ?? null }));
  } catch {
    return [];
  }
}

export interface ReportResult {
  report?: ReportData;
  configured: boolean;
  error?: string;
}

/**
 * Build the structured AI report for a symbol. `patterns` may be supplied (the
 * Chart already has them); otherwise they're detected from candles. Returns a
 * ReportData ready to hand to <ReportView>, or an error/unconfigured flag.
 */
export async function buildAiReport(
  symbol: string,
  info: Metrics,
  patterns?: { label: string; detail: string | null }[],
): Promise<ReportResult> {
  const corpActions = await fetchCorpActions(symbol);

  // Prefer the nightly pre-generated report (instant, ₹0). Only fall back to the
  // paid AI Edge Function for symbols without a cached file.
  const cached = await api.stockReport(symbol).catch(() => null);
  if (cached?.text) {
    return {
      configured: true,
      report: { aiText: cached.text, aiDisclaimer: cached.disclaimer ?? null, corpActions },
    };
  }

  const pats = patterns ?? (await patternsFor(symbol));
  // Don't feed placeholder values to the model (it would echo "Unknown").
  const facts = { ...info, sector: info.sector === "Unknown" ? undefined : info.sector };
  const res = await aiReport(symbol, facts, pats, corpActions);
  if (res.text) {
    return { configured: res.configured, report: { aiText: res.text, aiDisclaimer: res.disclaimer, corpActions } };
  }
  return { configured: res.configured, error: res.error };
}
