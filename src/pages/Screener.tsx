import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { generateReport } from "../lib/report";
import { isWatched, onWatchlistChange, toggleWatch } from "../lib/watchlist";
import type {
  Exchange,
  FieldDef,
  Filter,
  Logic,
  Metrics,
  Operator,
  ScreenRequest,
  SegmentInfo,
} from "../api/types";
import { fmtCap, fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import AdSlot from "../components/AdSlot";
import { parseScreen } from "../lib/nlScreen";
import { spend } from "../lib/economy";
import { COSTS } from "../lib/economy";
import "./Screener.css";

const OPS: { value: Operator; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
  { value: "between", label: "between" },
];

// Columns offered by the always-visible Sort control (mirrors the table columns).
// On mobile the results table scrolls horizontally and sits far down the page, so
// tapping the right-side header cells to sort is awkward — this makes sorting by
// any column reliable with a single tap, no scrolling required.
const SORT_COLS: { key: string; label: string }[] = [
  { key: "market_cap_cr", label: "Market Cap" },
  { key: "close", label: "LTP" },
  { key: "change_pct", label: "% Change" },
  { key: "volume", label: "Volume" },
  { key: "rel_volume", label: "Rel Volume" },
  { key: "rsi_14", label: "RSI" },
  { key: "pct_above_sma50", label: "% vs 50 DMA" },
  { key: "dist_52w_high_pct", label: "From 52w High" },
  { key: "symbol", label: "Symbol" },
];

const DEFAULT_REQ: ScreenRequest = {
  filters: [{ field: "change_pct", op: "gt", value: 2 }],
  logic: "AND",
  exchange: null,
  query: "",
  sort_by: "market_cap_cr",
  sort_dir: "desc",
  limit: 100,
};

// Module-level cache so navigating away from the Screener and back doesn't reset
// the user's screen (the route component unmounts on navigation). Survives for
// the session; a saved-screen "Run" (location.state) still takes precedence.
let cachedReq: ScreenRequest | null = null;
let cachedRows: Metrics[] = [];
let cachedCount = 0;

export default function Screener() {
  const location = useLocation();
  const incoming = (location.state as { request?: ScreenRequest } | null)?.request;

  const [fields, setFields] = useState<FieldDef[]>([]);
  const [segs, setSegs] = useState<SegmentInfo[]>([]);
  const [req, setReq] = useState<ScreenRequest>(incoming ?? cachedReq ?? DEFAULT_REQ);
  const [rows, setRows] = useState<Metrics[]>(incoming ? [] : cachedRows);
  const [count, setCount] = useState(incoming ? 0 : cachedCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setWatchTick] = useState(0);
  const [nlText, setNlText] = useState("");
  const [nlMsg, setNlMsg] = useState<string | null>(null);

  const nav = useNavigate();

  // Re-render row stars when the watchlist changes anywhere.
  useEffect(() => onWatchlistChange(() => setWatchTick((t) => t + 1)), []);

  const openChart = (m: Metrics) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(m.symbol)}` +
        `&name=${encodeURIComponent(m.name)}&exchange=${encodeURIComponent(m.exchange)}`,
    );
  const watch = (m: Metrics) =>
    toggleWatch({ symbol: m.symbol, name: m.name, exchange: m.exchange });

  const fieldMap = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, f])),
    [fields],
  );
  const groups = useMemo(() => {
    const g: Record<string, FieldDef[]> = {};
    for (const f of fields) (g[f.group] ??= []).push(f);
    return g;
  }, [fields]);

  useEffect(() => {
    api.fields().then(setFields).catch((e) => setError(String(e)));
    api.segments().then(setSegs).catch(() => {});
  }, []);

  // A segment is "included" when no explicit list is set (all) or it's listed.
  const segIncluded = (key: string) => !req.segments || req.segments.includes(key);
  const toggleSegment = (key: string) => {
    const all = segs.map((s) => s.key);
    const current = req.segments ?? all;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    if (next.length === 0) return; // never let the user exclude everything
    // Collapse "all selected" back to null so saved screens stay future-proof.
    update({ segments: next.length === all.length ? null : next });
  };

  async function run(r: ScreenRequest = req) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.screen(r);
      setRows(res.results);
      setCount(res.count);
      cachedRows = res.results;
      cachedCount = res.count;
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Persist the request so navigating away and back keeps the screen.
  useEffect(() => {
    cachedReq = req;
  }, [req]);

  // Run once fields are available — but skip if we restored cached results
  // (returning to the page), so the previous screen stays put.
  useEffect(() => {
    if (!fields.length) return;
    if (incoming || cachedRows.length === 0) run(req);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.length]);

  // ---- filter mutations ----
  const update = (patch: Partial<ScreenRequest>) => setReq((r) => ({ ...r, ...patch }));

  const buildFromText = () => {
    if (!nlText.trim()) return;
    // Credit-gated premium feature (free while economy is disabled).
    if (!spend("nl_screen_builder", COSTS.nlScreenBuilder)) {
      setNlMsg("Not enough credits.");
      return;
    }
    const parsed = parseScreen(nlText);
    if (!parsed.matchedAny) {
      setNlMsg("Couldn't recognise that yet — try e.g. \"golden crossover\", \"20 dma crossing 50\", \"rsi below 30 and above 200 dma\".");
      return;
    }
    setReq((r) => ({
      ...r,
      filters: parsed.filters,
      logic: parsed.logic,
      segments: parsed.segments ?? r.segments,
    }));
    setNlMsg("Understood: " + parsed.recognized.join(" · "));
  };
  const setFilter = (i: number, patch: Partial<Filter>) =>
    setReq((r) => ({
      ...r,
      filters: r.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }));
  const addFilter = () =>
    setReq((r) => ({
      ...r,
      filters: [...r.filters, { field: fields[0]?.key ?? "close", op: "gt", value: 0 }],
    }));
  const removeFilter = (i: number) =>
    setReq((r) => ({ ...r, filters: r.filters.filter((_, idx) => idx !== i) }));

  const sortBy = (key: string) => {
    const dir = req.sort_by === key && req.sort_dir === "desc" ? "asc" : "desc";
    applySort(key, dir);
  };
  // Sort by an explicit column + direction (used by the Sort control and headers).
  const applySort = (key: string, dir: "asc" | "desc") => {
    const next = { ...req, sort_by: key, sort_dir: dir };
    setReq(next);
    run(next);
  };

  const save = async () => {
    const name = window.prompt("Name this screen");
    if (!name) return;
    try {
      await api.saveScreen(name, req);
      window.alert(`Saved “${name}”. Find it under Saved Screens.`);
    } catch (e) {
      window.alert(`Could not save: ${e}`);
    }
  };

  return (
    <section className="scr">
      <header className="scr-top">
        <p className="scr-disclaimer">
          <strong>For information only — not investment advice.</strong> TaurEye
          is not a SEBI-registered Investment Adviser or Research Analyst and gives
          no buy/sell recommendations. Figures are end-of-day exchange data, may be
          delayed or contain errors, and are not for trade execution — verify with
          NSE/BSE. Investments are subject to market risks.
        </p>
      </header>

      {error && (
        <div className="api-down">
          <strong>Can’t reach the backend.</strong> Start it with{" "}
          <code>npm start</code> (runs API + app together), then{" "}
          <button className="retry" onClick={() => run()}>retry</button>.
          <span className="api-down-detail">{error}</span>
        </div>
      )}

      <div className="panel">
        <div className="nl-builder">
          <span className="nl-spark">✨</span>
          <input
            className="nl-input"
            placeholder='Describe a screen — e.g. "golden crossover", "20 dma crossing 50", "rsi below 30 and above 200 dma"'
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buildFromText()}
          />
          <button className="nl-build" onClick={buildFromText}>Build</button>
        </div>
        {nlMsg && <p className="nl-msg">{nlMsg}</p>}

        <div className="panel-controls">
          <label className="ctl">
            <span>Exchange</span>
            <select
              value={req.exchange ?? ""}
              onChange={(e) => update({ exchange: (e.target.value || null) as Exchange | null })}
            >
              <option value="">All</option>
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
          </label>
          <label className="ctl grow">
            <span>Search</span>
            <input
              placeholder="Symbol or name…"
              value={req.query ?? ""}
              onChange={(e) => update({ query: e.target.value })}
            />
          </label>
          <label className="ctl">
            <span>Match</span>
            <select value={req.logic} onChange={(e) => update({ logic: e.target.value as Logic })}>
              <option value="AND">All filters</option>
              <option value="OR">Any filter</option>
            </select>
          </label>
          <label className="ctl">
            <span>Limit</span>
            <select value={req.limit} onChange={(e) => update({ limit: Number(e.target.value) })}>
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="ctl">
            <span>Sort by</span>
            <select
              value={req.sort_by}
              onChange={(e) => applySort(e.target.value, req.sort_dir)}
            >
              {SORT_COLS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <div className="ctl">
            <span>Order</span>
            <button
              type="button"
              className="sort-dir"
              onClick={() => applySort(req.sort_by, req.sort_dir === "desc" ? "asc" : "desc")}
              title="Toggle sort direction"
            >
              {req.sort_dir === "desc" ? "High → Low ▾" : "Low → High ▴"}
            </button>
          </div>
          {segs.length > 1 && (
            <div className="ctl seg-ctl">
              <span>Segments</span>
              <div className="seg-chips">
                {segs.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`seg-chip${segIncluded(s.key) ? " on" : ""}`}
                    onClick={() => toggleSegment(s.key)}
                    title={`${s.label} (${fmtInt(s.count)}) — click to ${segIncluded(s.key) ? "exclude" : "include"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="filters">
          {req.filters.map((f, i) => {
            const fd = fieldMap[f.field];
            return (
              <div className="filter-block" key={i}>
              <div className="filter-row">
                <select
                  className="f-field"
                  value={f.field}
                  onChange={(e) => setFilter(i, { field: e.target.value })}
                >
                  {Object.entries(groups).map(([g, fs]) => (
                    <optgroup key={g} label={g}>
                      {fs.map((fo) => (
                        <option key={fo.key} value={fo.key}>{fo.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  className="f-op"
                  value={f.op}
                  onChange={(e) => setFilter(i, { op: e.target.value as Operator })}
                >
                  {OPS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  className="f-val mono"
                  type="number"
                  value={f.value}
                  onChange={(e) => setFilter(i, { value: Number(e.target.value) })}
                />
                {f.op === "between" && (
                  <input
                    className="f-val mono"
                    type="number"
                    value={f.value2 ?? 0}
                    onChange={(e) => setFilter(i, { value2: Number(e.target.value) })}
                  />
                )}
                <span className="f-unit">{fd?.unit ?? ""}</span>
                <button className="f-del" onClick={() => removeFilter(i)} title="Remove">
                  ✕
                </button>
              </div>
              {fd?.desc && <p className="f-hint">{fd.desc}</p>}
              </div>
            );
          })}
          {req.filters.length === 0 && (
            <p className="no-filters">No filters — showing the full universe.</p>
          )}
        </div>

        <div className="panel-actions">
          <button className="btn-add" onClick={addFilter}>+ Add filter</button>
          <div className="spacer" />
          <button className="btn-save" onClick={save}>Save screen</button>
          <button className="btn-run" onClick={() => run()} disabled={loading}>
            {loading ? "Running…" : "Run screen"}
          </button>
        </div>
      </div>

      <AdSlot label="Screener banner" height={70} />

      <div className="results-head">
        <strong>{fmtInt(count)}</strong> matches
        {error && <span className="err">· {error}</span>}
      </div>

      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              <Th k="symbol" req={req} onSort={sortBy} align="left">Symbol</Th>
              <th className="left col-name">Name</th>
              <th>Exch</th>
              <Th k="close" req={req} onSort={sortBy}>LTP</Th>
              <Th k="change_pct" req={req} onSort={sortBy}>% Chg</Th>
              <Th k="volume" req={req} onSort={sortBy}>Volume</Th>
              <Th k="rel_volume" req={req} onSort={sortBy}>Rel Vol</Th>
              <Th k="rsi_14" req={req} onSort={sortBy}>RSI</Th>
              <Th k="pct_above_sma50" req={req} onSort={sortBy}>vs 50DMA</Th>
              <Th k="dist_52w_high_pct" req={req} onSort={sortBy}>52w Hi</Th>
              <Th k="market_cap_cr" req={req} onSort={sortBy}>Mkt Cap</Th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={`${m.exchange}:${m.symbol}`}>
                <td className="left sym">
                  <button
                    type="button"
                    className="sym-link"
                    onClick={() => openChart(m)}
                    title={`${m.name} — open details`}
                  >
                    {m.symbol}
                  </button>
                </td>
                <td className="left name col-name">{m.name}</td>
                <td className="dim">{m.exchange}</td>
                <td className="mono">{fmtNum(m.close)}</td>
                <td className={`mono ${signClass(m.change_pct)}`}>{fmtPct(m.change_pct)}</td>
                <td className="mono dim">{fmtInt(m.volume)}</td>
                <td className="mono">{fmtNum(m.rel_volume)}x</td>
                <td className="mono">{m.rsi_14.toFixed(0)}</td>
                <td className={`mono ${signClass(m.pct_above_sma50)}`}>{fmtPct(m.pct_above_sma50)}</td>
                <td className={`mono ${signClass(m.dist_52w_high_pct)}`}>{fmtPct(m.dist_52w_high_pct)}</td>
                <td className="mono">{fmtCap(m.market_cap_cr)}</td>
                <td className="row-actions">
                  <button
                    className="ra-btn"
                    title="Open chart"
                    onClick={() => openChart(m)}
                  >
                    Chart
                  </button>
                  <button
                    className={`ra-btn star ${isWatched(m.symbol) ? "on" : ""}`}
                    title={isWatched(m.symbol) ? "Remove from watchlist" : "Add to watchlist"}
                    onClick={() => watch(m)}
                  >
                    {isWatched(m.symbol) ? "★" : "☆"}
                  </button>
                  <button
                    className="ra-btn"
                    title="Generate report"
                    onClick={() => generateReport(m)}
                  >
                    Report
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={12} className="empty">No scrips match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  k,
  req,
  onSort,
  align = "right",
  children,
}: {
  k: string;
  req: ScreenRequest;
  onSort: (k: string) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = req.sort_by === k;
  return (
    <th
      className={`sortable ${align} ${active ? "active" : ""}`}
      onClick={() => onSort(k)}
    >
      {children}
      <span className="arrow">{active ? (req.sort_dir === "desc" ? "▾" : "▴") : ""}</span>
    </th>
  );
}
