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
import "./Watchlist.css";

interface Quote {
  close: number;
  change_pct: number;
  date: string;
}

export default function Watchlist() {
  const nav = useNavigate();
  const [items, setItems] = useState<WatchItem[]>(getWatchlist());
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});

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

  return (
    <section className="wl">
      <header className="wl-head">
        <h1>Watchlist</h1>
        <span className="wl-count">{items.length} scrip{items.length === 1 ? "" : "s"}</span>
      </header>
      <p className="wl-sub">Saved on this device · end-of-day quotes.</p>

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
                <th>As of</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => {
                const q = quotes[w.symbol];
                return (
                  <tr key={w.symbol}>
                    <td className="left sym">{w.symbol}</td>
                    <td className="left name">{w.name}</td>
                    <td className="dim">{w.exchange}</td>
                    <td className="mono">{q ? fmtNum(q.close) : "—"}</td>
                    <td className={`mono ${q ? signClass(q.change_pct) : ""}`}>
                      {q ? fmtPct(q.change_pct) : "—"}
                    </td>
                    <td className="dim mono">{q?.date ?? "—"}</td>
                    <td className="wl-actions">
                      <button className="mini" title="Open chart" onClick={() => openChart(w)}>
                        Chart
                      </button>
                      <button
                        className="mini danger"
                        title="Remove from watchlist"
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
    </section>
  );
}
