import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { fmtNum, fmtPct, signClass } from "../lib/format";
import {
  getWatchlist,
  onWatchlistChange,
  removeWatch,
  type WatchItem,
} from "../lib/watchlist";
import { COSTS, spend } from "../lib/economy";
import { buildAiReport } from "../lib/reportData";
import ReportView, { type ReportData } from "../components/ReportView";
import type { Metrics } from "../api/types";
import "./Watchlist.css";

interface Quote {
  close: number;
  change_pct: number;
  date: string;
}

// Which report is being generated for which symbol (drives the spinner labels).
type Busy = { symbol: string; kind: "report" | "ai" } | null;

export default function Watchlist() {
  const nav = useNavigate();
  const [items, setItems] = useState<WatchItem[]>(getWatchlist());
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [view, setView] = useState<{ m: Metrics; data: ReportData } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Keep the list in sync with adds/removes from anywhere (screener, other tab).
  useEffect(() => onWatchlistChange(() => setItems(getWatchlist())), []);

  const loadQuotes = useCallback(async (list: WatchItem[]) => {
    const entries = await Promise.all(
      list.map(async (w): Promise<[string, Quote | null]> => {
        try {
          const c = await api.candles(w.symbol, 2);
          if (!c.length) return [w.symbol, null];
          const last = c[c.length - 1];
          const prev = c.length > 1 ? c[c.length - 2] : last;
          const chg = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
          return [w.symbol, { close: last.close, change_pct: chg, date: last.date }];
        } catch {
          return [w.symbol, null];
        }
      }),
    );
    setQuotes(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (items.length) loadQuotes(items);
  }, [items, loadQuotes]);

  const openChart = (w: WatchItem) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(w.symbol)}` +
        `&name=${encodeURIComponent(w.name)}&exchange=${encodeURIComponent(w.exchange)}`,
    );

  // Generate a report without leaving the page. "report" = factual (metrics
  // only); "ai" = the structured AI report (credit-gated, free while disabled).
  const openReport = async (w: WatchItem, kind: "report" | "ai") => {
    if (busy) return;
    setMsg(null);
    if (kind === "ai" && !spend("advanced_report", COSTS.advancedReport)) {
      setMsg("Not enough credits for an AI report.");
      return;
    }
    setBusy({ symbol: w.symbol, kind });
    try {
      const m = await api.metrics(w.symbol);
      if (kind === "report") {
        setView({ m, data: { aiText: null } });
        return;
      }
      const res = await buildAiReport(w.symbol, m);
      if (res.report) setView({ m, data: res.report });
      else if (!res.configured) setMsg("AI report isn't configured yet (deploy the ai-report function).");
      else setMsg(res.error ? `Report error: ${res.error}` : "Report unavailable.");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="wl">
      <header className="wl-head">
        <h1>Watchlist</h1>
        <span className="wl-count">{items.length} scrip{items.length === 1 ? "" : "s"}</span>
      </header>
      <p className="wl-sub">
        Saved on this device · end-of-day quotes · change shown since you added each scrip.
      </p>
      {msg && <p className="wl-msg">{msg}</p>}

      {items.length === 0 ? (
        <div className="wl-empty">
          <p>Your watchlist is empty.</p>
          <button className="btn-link" onClick={() => nav("/app/screener")}>
            Add scrips from the Screener →
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="wl-table">
            <thead>
              <tr>
                <th className="left">Symbol</th>
                <th className="left">Name</th>
                <th>Exch</th>
                <th>LTP</th>
                <th>% Chg</th>
                <th>Added @</th>
                <th>Added on</th>
                <th>Since add</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => {
                const q = quotes[w.symbol];
                const since =
                  q && w.addedPrice
                    ? ((q.close - w.addedPrice) / w.addedPrice) * 100
                    : null;
                const addedOn = w.addedAt
                  ? new Date(w.addedAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—";
                const isBusy = busy?.symbol === w.symbol;
                return (
                  <tr key={w.symbol}>
                    <td className="left sym">
                      <button
                        type="button"
                        className="sym-link"
                        onClick={() => openChart(w)}
                        title={`${w.name} — open chart & details`}
                      >
                        {w.symbol}
                      </button>
                    </td>
                    <td className="left name">
                      <button type="button" className="name-link" onClick={() => openChart(w)}>
                        {w.name}
                      </button>
                    </td>
                    <td className="dim">{w.exchange}</td>
                    <td className="mono">{q ? fmtNum(q.close) : "—"}</td>
                    <td className={`mono ${q ? signClass(q.change_pct) : ""}`}>
                      {q ? fmtPct(q.change_pct) : "—"}
                    </td>
                    <td className="mono dim">{w.addedPrice != null ? fmtNum(w.addedPrice) : "—"}</td>
                    <td className="dim mono">{addedOn}</td>
                    <td className={`mono ${since != null ? signClass(since) : ""}`}>
                      {since != null ? fmtPct(since) : "—"}
                    </td>
                    <td className="wl-actions">
                      <button className="mini" title="Open chart" onClick={() => openChart(w)}>
                        Chart
                      </button>
                      <button
                        className="mini"
                        title="Open factual report"
                        disabled={!!busy}
                        onClick={() => openReport(w, "report")}
                      >
                        {isBusy && busy?.kind === "report" ? "…" : "Report"}
                      </button>
                      <button
                        className="mini ai"
                        title="Generate AI report"
                        disabled={!!busy}
                        onClick={() => openReport(w, "ai")}
                      >
                        {isBusy && busy?.kind === "ai" ? "…" : "✨ AI"}
                      </button>
                      <button
                        className="mini danger"
                        title="Remove from watchlist"
                        disabled={!!busy}
                        onClick={() => removeWatch(w.symbol)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view && (
        <ReportView m={view.m} data={view.data} onClose={() => setView(null)} />
      )}
    </section>
  );
}
