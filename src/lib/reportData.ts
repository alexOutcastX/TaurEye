// Shared report-building flow used by the Chart page and the Watchlist so a
// "normal" (metrics-only) report and an AI report can be generated from anywhere
// without opening the chart. Keeps the corporate-actions fetch + AI-report call
// in one place (was previously inlined in Chart only).

import { api, aiReport } from "../api/client";
import { AI_LIVE, dataUrl } from "../data/source";
import { detectPatterns } from "./patterns";
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

/**
 * A brief factual company description from the published funda/<SYMBOL>.json
 * (the `about` field). Returns null until a profile has been exported, so the
 * caller can simply hide the section.
 */
export async function fetchCompanyAbout(symbol: string): Promise<string | null> {
  try {
    const r = await fetch(dataUrl(`funda/${encodeURIComponent(symbol)}.json`));
    if (r.ok) {
      const about = (await r.json()).about;
      return typeof about === "string" && about.trim() ? about.trim() : null;
    }
  } catch {
    /* no funda file / no profile yet — the About section just stays hidden */
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
 * Build the structured report for a symbol. Always prefers the nightly
 * pre-generated bundle (reports/<SYMBOL>.json): templated, ₹0, no backend. In
 * LIVE mode (VITE_AI_MODE=live) symbols without a cached file fall back to the
 * ai-report Edge Function (Anthropic); in CACHE mode they show a friendly
 * "available after next refresh" note and no backend is ever called.
 */
export async function buildAiReport(symbol: string): Promise<ReportResult> {
  const corpActions = await fetchCorpActions(symbol);

  const cached = await api.stockReport(symbol).catch(() => null);
  if (cached?.report) {
    return {
      configured: true,
      report: { aiText: cached.report, aiDisclaimer: cached.disclaimer ?? null, corpActions },
    };
  }

  // No cached report. LIVE mode generates one via the Edge Function; CACHE mode
  // (default, cost-zero) shows a note until tonight's publish.
  if (AI_LIVE) {
    const info = await api.metrics(symbol).catch(() => null);
    const pats = await patternsFor(symbol);
    // Don't feed placeholder values to the model (it would echo "Unknown").
    const facts = info ? { ...info, sector: info.sector === "Unknown" ? undefined : info.sector } : { symbol };
    const res = await aiReport(symbol, facts, pats, corpActions);
    if (res.text) {
      return { configured: res.configured, report: { aiText: res.text, aiDisclaimer: res.disclaimer, corpActions } };
    }
    return { configured: res.configured, error: res.error };
  }

  return {
    configured: true,
    report: {
      aiText: "This report is generated nightly from end-of-day data — it will appear after the next refresh.",
      aiDisclaimer: cached?.disclaimer ?? null,
      corpActions,
    },
  };
}
