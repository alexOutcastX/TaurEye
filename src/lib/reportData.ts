// Shared report-building flow used by the Chart page and the Watchlist so a
// "normal" (metrics-only) report and an AI report can be generated from anywhere
// without opening the chart. Keeps the corporate-actions fetch + AI-report call
// in one place (was previously inlined in Chart only).

import { api } from "../api/client";
import { dataUrl } from "../data/source";
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

export interface ReportResult {
  report?: ReportData;
  configured: boolean;
  error?: string;
}

/**
 * Build the structured report for a symbol from the nightly pre-generated bundle
 * (templated, ₹0, no backend), returning a ReportData ready for <ReportView>.
 */
export async function buildAiReport(symbol: string): Promise<ReportResult> {
  const corpActions = await fetchCorpActions(symbol);

  // Reports are served entirely from the NIGHTLY pre-generated bundle
  // (reports/<SYMBOL>.json): templated, refreshed each night from new EOD data,
  // ₹0 — no Edge Functions, no Anthropic. Until tonight's first publish we show a
  // friendly note instead of calling any backend.
  const cached = await api.stockReport(symbol).catch(() => null);
  const aiText =
    cached?.report ??
    "This report is generated nightly from end-of-day data — it will appear after the next refresh.";
  return {
    configured: true,
    report: { aiText, aiDisclaimer: cached?.disclaimer ?? null, corpActions },
  };
}
