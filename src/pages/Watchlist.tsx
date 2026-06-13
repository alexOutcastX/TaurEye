import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { fmtNum, fmtPct, signClass } from "../lib/format";
import {
  createWatchlist,
  deleteWatchlist,
  getWatchlists,
  moveToWatchlist,
  onWatchlistChange,
  removeFromWatchlist,
  renameWatchlist,
  type Watchlist as WL,
  type WatchItem,
} from "../lib/watchlist";
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
  const [lists, setLists] = useState<WL[]>(getWatchlists());
  const [activeId, setActiveId] = useState<string>(lists[0]?.id ?? "default");
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [view, setView] = useState<{ m: Metrics; data: ReportData } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Keep lists in sync with adds/removes from anywhere (screener, chart, tab).
  useEffect(() => onWatchlistChange(() => setLists(getWatchlists())), []);

  // Keep the active selection valid as lists are created/deleted.
  useEffect(() => {
    if (!lists.some((l) => l.id === activeId)) setActiveId(lists[0]?.id ?? "default");
  }, [lists, activeId]);

  const active = useMemo(
    () => lists.find((l) => l.id === activeId) ?? lists[0],
    [lists, activeId],
  );
  const items = useMemo(() => active?.items ?? [], [active]);

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
    setQuotes((q) => ({ ...q, ...Object.fromEntries(entries) }));
  }, []);

  useEffect(() => {
    if (items.length) loadQuotes(items);
  }, [items, loadQuotes]);

  const openChart = (w: WatchItem) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(w.symbol)}` +
        `&name=${encodeURIComponent(w.name)}&exchange=${encodeURIComponent(w.exchange)}`,
    );

  // ---- list management ----
  const addList = () => {
    const name = window.prompt("Name the new watchlist");
    if (!name?.trim()) return;
    const wl = createWatchlist(name);
    setActiveId(wl.id);
  };
  const rename = () => {
    if (!active) return;
    const name = window.prompt("Rename watchlist", active.name);
    if (name?.trim()) renameWatchlist(active.id, name);
  };
  const remove = () => {
    if (!active) return;
    const ok = window.confirm(
      `Delete “${active.name}”?` +
        (active.items.length ? ` Its ${active.items.length} scrip(s) will be removed.` : ""),
    );
    if (ok) deleteWatchlist(active.id);
  };

  // Generate a report without leaving the page. "report" = factual (metrics
  // only); "ai" = the structured AI report (credit-gated, free while disabled).
  const openReport = async (w: WatchItem, kind: "report" | "ai") => {
    if (busy) return;
    setMsg(null);
    // The AI report is charged server-side by the ai-report Edge Function — no
    // client-side debit here (avoids double-billing once charging is on).
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
      else if (res.error === "insufficient_credits") setMsg("Not enough credits for an AI report.");
      else setMsg(res.error ? `Report error: ${res.error}` : "Report unavailable.");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  };

  const otherLists = lists.filter((l) => l.id !== active?.id);

  return (
    <section className="wl">
      <header className="wl-head">
        <h1>Watchlists</h1>
        <span className="wl-count">{items.length} scrip{items.length === 1 ? "" : "s"}</span>
      </header>

      {/* list selector + management */}
      <div className="wl-tabs">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`wl-tab${l.id === active?.id ? " on" : ""}`}
            onClick={() => setActiveId(l.id)}
          >
            {l.name}
            <span className="wl-tab-count">{l.items.length}</span>
          </button>
        ))}
        <button type="button" className="wl-tab add" onClick={addList} title="Create a watchlist">
          + New
        </button>
        <span className="wl-tabs-spacer" />
        {active && (
          <>
            <button type="button" className="wl-mng" onClick={rename} title="Rename this watchlist">
              Rename
            </button>
            <button
              type="button"
              className="wl-mng danger"
              onClick={remove}
              disabled={lists.length <= 1}
              title={lists.length <= 1 ? "Keep at least one watchlist" : "Delete this watchlist"}
            >
              Delete
            </button>
          </>
        )}
      </div>

      <p className="wl-sub">
        Saved on this device · end-of-day quotes · change shown since you added each scrip.
      </p>
      {msg && <p className="wl-msg">{msg}</p>}

      {items.length === 0 ? (
        <div className="wl-empty">
          <p>“{active?.name}” is empty.</p>
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
                      {otherLists.length > 0 && (
                        <select
                          className="mini wl-move"
                          title="Move to another watchlist"
                          value=""
                          onChange={(e) => {
                            if (active && e.target.value) {
                              moveToWatchlist(active.id, e.target.value, w.symbol);
                            }
                          }}
                        >
                          <option value="" disabled>
                            Move…
                          </option>
                          {otherLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="mini danger"
                        title="Remove from this watchlist"
                        disabled={!!busy}
                        onClick={() => active && removeFromWatchlist(active.id, w.symbol)}
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
