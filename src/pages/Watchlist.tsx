import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { fmtNum, fmtPct, signClass } from "../lib/format";
import {
  addToWatchlist,
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
import { shareLink } from "../lib/share";
import { decodeWatchlist, watchlistShareUrl } from "../lib/shareWatchlist";
import { useColumns, type ColDef } from "../lib/columns";
import { ColumnMenu, ExportMenu } from "../components/TableTools";
import { buildAiReport } from "../lib/reportData";
import ReportView, { type ReportData } from "../components/ReportView";
import type { Metrics } from "../api/types";
import { useCredits } from "../lib/useCredits";
import { COSTS } from "../lib/economy";
import "./Watchlist.css";

interface Quote {
  close: number;
  change_pct: number;
  date: string;
}

// Configurable data columns for the watchlist table (Actions is always last and
// not part of this config). Users can hide/show and reorder these.
const WL_COLS: ColDef[] = [
  { key: "symbol", label: "Symbol", locked: true, align: "left" },
  { key: "name", label: "Name", align: "left" },
  { key: "exchange", label: "Exch", align: "left" },
  { key: "ltp", label: "LTP", align: "right" },
  { key: "chg", label: "% Chg", align: "right" },
  { key: "addedPrice", label: "Added @", align: "right" },
  { key: "addedOn", label: "Added on", align: "left" },
  { key: "since", label: "Since add", align: "right" },
];

// Which report is being generated for which symbol (drives the spinner labels).
type Busy = { symbol: string; kind: "report" | "ai" } | null;

export default function Watchlist() {
  const nav = useNavigate();
  const { spend } = useCredits();
  const [lists, setLists] = useState<WL[]>(getWatchlists());
  const [activeId, setActiveId] = useState<string>(lists[0]?.id ?? "default");
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [view, setView] = useState<{ m: Metrics; data: ReportData } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { prefs, setPrefs, reset, visible } = useColumns("watchlist", WL_COLS);

  // Keep lists in sync with adds/removes from anywhere (screener, chart, tab).
  useEffect(() => onWatchlistChange(() => setLists(getWatchlists())), []);

  // Keep the active selection valid as lists are created/deleted.
  useEffect(() => {
    if (!lists.some((l) => l.id === activeId)) setActiveId(lists[0]?.id ?? "default");
  }, [lists, activeId]);

  // Import a shared watchlist (/app/watchlist?w=<token>) once on open: create a
  // new list from its scrips, then strip the param so a refresh doesn't re-import.
  useEffect(() => {
    const tok = new URLSearchParams(window.location.search).get("w");
    if (!tok) return;
    const shared = decodeWatchlist(tok);
    if (shared) {
      const wl = createWatchlist(shared.name);
      shared.items.forEach((it) => addToWatchlist(wl.id, it));
      setActiveId(wl.id);
      setMsg(`Imported “${wl.name}” — ${shared.items.length} scrip${shared.items.length === 1 ? "" : "s"} added to a new watchlist.`);
    }
    const u = new URL(window.location.href);
    u.searchParams.delete("w");
    window.history.replaceState({}, "", u.pathname + u.search);
  }, []);

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
  // Share the active watchlist as a link that imports it for the recipient.
  const share = async () => {
    if (!active) return;
    if (active.items.length === 0) {
      setMsg("Add some scrips to this watchlist first, then share.");
      return;
    }
    const syms = active.items.slice(0, 20).map((w) => w.symbol);
    const more = active.items.length > syms.length ? ` +${active.items.length - syms.length} more` : "";
    const text = `“${active.name}” watchlist on TaurEye — ${active.items.length} scrips: ${syms.join(", ")}${more}`;
    const r = await shareLink({ title: "TaurEye watchlist", text, url: watchlistShareUrl(active) });
    if (r === "copied") setMsg("Watchlist link copied — opening it imports these scrips.");
    else if (r === "failed") setMsg("Couldn’t share the watchlist.");
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
    // The AI report content is free (nightly cache), but credits still gate it.
    if (kind === "ai") {
      const charge = await spend("advanced_report", COSTS.advancedReport);
      if (!charge.ok) {
        setMsg(charge.error === "insufficient" ? "Not enough credits for an AI report." : "Couldn't process credits.");
        return;
      }
    }
    setBusy({ symbol: w.symbol, kind });
    try {
      const m = await api.metrics(w.symbol);
      if (kind === "report") {
        setView({ m, data: { aiText: null } });
        return;
      }
      const res = await buildAiReport(w.symbol);
      if (res.report) setView({ m, data: res.report });
      else setMsg(res.error ? `Report: ${res.error}` : "Report unavailable.");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  };

  const otherLists = lists.filter((l) => l.id !== active?.id);

  // Per-row derived values shared by the on-screen cells and the exporters.
  const derive = (w: WatchItem) => {
    const q = quotes[w.symbol];
    const since = q && w.addedPrice ? ((q.close - w.addedPrice) / w.addedPrice) * 100 : null;
    const addedOn = w.addedAt
      ? new Date(w.addedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
    return { q, since, addedOn };
  };

  // Display string for a data column (used by CSV / Excel / PDF exports).
  const cellText = (key: string, w: WatchItem, d: ReturnType<typeof derive>): string => {
    switch (key) {
      case "symbol": return w.symbol;
      case "name": return w.name;
      case "exchange": return w.exchange;
      case "ltp": return d.q ? fmtNum(d.q.close) : "";
      case "chg": return d.q ? fmtPct(d.q.change_pct) : "";
      case "addedPrice": return w.addedPrice != null ? fmtNum(w.addedPrice) : "";
      case "addedOn": return d.addedOn === "—" ? "" : d.addedOn;
      case "since": return d.since != null ? fmtPct(d.since) : "";
      default: return "";
    }
  };

  const buildExportData = () => ({
    columns: visible.map((c) => ({ key: c.key, label: c.label, align: c.align })),
    rows: items.map((w) => {
      const d = derive(w);
      const row: Record<string, string> = {};
      for (const c of visible) row[c.key] = cellText(c.key, w, d);
      return row;
    }),
  });

  // On-screen cell for a data column (Actions is rendered separately).
  const renderCell = (c: ColDef, w: WatchItem, d: ReturnType<typeof derive>) => {
    switch (c.key) {
      case "symbol":
        return (
          <td key={c.key} className="left sym">
            <button type="button" className="sym-link" onClick={() => openChart(w)} title={`${w.name} — open chart & details`}>
              {w.symbol}
            </button>
          </td>
        );
      case "name":
        return (
          <td key={c.key} className="left name">
            <button type="button" className="name-link" onClick={() => openChart(w)}>{w.name}</button>
          </td>
        );
      case "exchange":
        return <td key={c.key} className="dim">{w.exchange}</td>;
      case "ltp":
        return <td key={c.key} className="mono">{d.q ? fmtNum(d.q.close) : "—"}</td>;
      case "chg":
        return (
          <td key={c.key} className={`mono ${d.q ? signClass(d.q.change_pct) : ""}`}>
            {d.q ? fmtPct(d.q.change_pct) : "—"}
          </td>
        );
      case "addedPrice":
        return <td key={c.key} className="mono dim">{w.addedPrice != null ? fmtNum(w.addedPrice) : "—"}</td>;
      case "addedOn":
        return <td key={c.key} className="dim mono">{d.addedOn}</td>;
      case "since":
        return (
          <td key={c.key} className={`mono ${d.since != null ? signClass(d.since) : ""}`}>
            {d.since != null ? fmtPct(d.since) : "—"}
          </td>
        );
      default:
        return <td key={c.key} />;
    }
  };

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
            <button type="button" className="wl-mng" onClick={share} title="Share this watchlist (opening the link imports it)">
              Share
            </button>
            <button type="button" className="wl-mng" onClick={rename} title="Rename this watchlist">
              Rename
            </button>
            <button
              type="button"
              className="wl-mng danger"
              onClick={remove}
              title="Delete this watchlist"
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
        <>
          <div className="wl-toolbar">
            <ColumnMenu defs={WL_COLS} prefs={prefs} onChange={setPrefs} onReset={reset} />
            <ExportMenu
              filename={`taureye-watchlist-${active?.name ?? "list"}`}
              title={`Watchlist — ${active?.name ?? ""}`}
              subtitle={`${items.length} scrip${items.length === 1 ? "" : "s"}`}
              getData={buildExportData}
            />
          </div>
          <div className="table-wrap">
          <table className="wl-table">
            <thead>
              <tr>
                {visible.map((c) => (
                  <th key={c.key} className={c.align === "left" ? "left" : ""}>{c.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => {
                const d = derive(w);
                const isBusy = busy?.symbol === w.symbol;
                return (
                  <tr key={w.symbol}>
                    {visible.map((c) => renderCell(c, w, d))}
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
        </>
      )}

      {view && (
        <ReportView m={view.m} data={view.data} onClose={() => setView(null)} />
      )}
    </section>
  );
}
