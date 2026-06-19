import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import ReportView from "../components/ReportView";
import { isWatched, onWatchlistChange, type WatchItem } from "../lib/watchlist";
import WatchlistMenu from "../components/WatchlistMenu";
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
import { PRESETS, type Preset } from "../config/presets";
import { decodeScreen, shareUrl } from "../lib/shareScreen";
import { copyToClipboard } from "../lib/referral";
import "./Screener.css";

const OPS: { value: Operator; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
  { value: "between", label: "between" },
];

// Preset scans grouped by their category, for the collapsible multi-select.
const PRESET_GROUPS = PRESETS.reduce<Record<string, Preset[]>>((acc, p) => {
  (acc[p.group] ??= []).push(p);
  return acc;
}, {});

// Client-side sort of the loaded results. Keeps the displayed order a pure
// function of (column, direction) so tapping a header/changing the control
// ALWAYS reorders the table — instant, and independent of the screen re-query.
// Missing values sink to the bottom in both directions (mirrors the engine).
type Sortable = number | string | null | undefined;
function sortRows(rows: Metrics[], key: string, dir: "asc" | "desc"): Metrics[] {
  const reverse = dir === "desc";
  const val = (m: Metrics) => (m as unknown as Record<string, Sortable>)[key];
  const missing = (v: Sortable) =>
    v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    const ma = missing(va);
    const mb = missing(vb);
    if (ma && mb) return 0;
    if (ma) return 1;
    if (mb) return -1;
    const cmp = va! < vb! ? -1 : va! > vb! ? 1 : 0;
    return reverse ? -cmp : cmp;
  });
}

const DEFAULT_REQ: ScreenRequest = {
  // Default to no filters — the screener opens on the full universe.
  filters: [],
  logic: "AND",
  exchange: null,
  query: "",
  // Default sort: last traded price, high → low.
  sort_by: "close",
  sort_dir: "desc",
  // No result cap — the screener returns every match and the table paginates.
  // (Kept in the request shape for the legacy live-API branch; local ignores it.)
  limit: 100000,
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
  // A shared-screen link (?s=<token>) — decoded once; takes effect on first load.
  const [shared] = useState<ScreenRequest | null>(() =>
    decodeScreen(new URLSearchParams(location.search).get("s")),
  );

  const [fields, setFields] = useState<FieldDef[]>([]);
  const [segs, setSegs] = useState<SegmentInfo[]>([]);
  const [req, setReq] = useState<ScreenRequest>(incoming ?? shared ?? cachedReq ?? DEFAULT_REQ);
  const [rows, setRows] = useState<Metrics[]>(incoming || shared ? [] : cachedRows);
  const [count, setCount] = useState(incoming || shared ? 0 : cachedCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setWatchTick] = useState(0);
  const [nlText, setNlText] = useState("");
  const [nlMsg, setNlMsg] = useState<string | null>(null);
  // Preset scans: a collapsible dropdown the user can pick MULTIPLE from (their
  // filters combine with AND). `presetsOpen` toggles the panel.
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  // Row "report" opens the in-app report view (metrics only — AI report lives
  // on the Chart page). No popup windows anywhere.
  const [reportFor, setReportFor] = useState<Metrics | null>(null);
  // Open watchlist picker (which list to add a scrip to), anchored to its star.
  const [wlMenu, setWlMenu] = useState<{ item: WatchItem; rect: DOMRect } | null>(null);
  // Client-side pagination over the full match set (no server cap anymore).
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);

  const nav = useNavigate();

  // Re-render row stars when the watchlist changes anywhere.
  useEffect(() => onWatchlistChange(() => setWatchTick((t) => t + 1)), []);

  const openChart = (m: Metrics) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(m.symbol)}` +
        `&name=${encodeURIComponent(m.name)}&exchange=${encodeURIComponent(m.exchange)}`,
    );
  // Open the watchlist picker for this scrip, anchored to the clicked star.
  const watch = (m: Metrics, e: React.MouseEvent<HTMLButtonElement>) =>
    setWlMenu({
      item: { symbol: m.symbol, name: m.name, exchange: m.exchange, addedPrice: m.close },
      rect: e.currentTarget.getBoundingClientRect(),
    });

  const fieldMap = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, f])),
    [fields],
  );
  const groups = useMemo(() => {
    const g: Record<string, FieldDef[]> = {};
    for (const f of fields) (g[f.group] ??= []).push(f);
    return g;
  }, [fields]);

  // All matching rows, sorted by the active column/direction.
  const displayRows = useMemo(
    () => sortRows(rows, req.sort_by, req.sort_dir),
    [rows, req.sort_by, req.sort_dir],
  );
  const pageCount = Math.max(1, Math.ceil(displayRows.length / pageSize));
  // The single page of rows currently shown.
  const pageRows = useMemo(
    () => displayRows.slice(page * pageSize, page * pageSize + pageSize),
    [displayRows, page, pageSize],
  );
  // Snap back to the first page whenever the result set, sort, or page size changes.
  useEffect(() => {
    setPage(0);
  }, [rows, req.sort_by, req.sort_dir, pageSize]);

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
    if (incoming || shared || cachedRows.length === 0) run(req);
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
  // displayRows reorders the currently-loaded rows instantly (no flicker), but we
  // ALSO re-run the screen: the engine sorts then slices to `limit`, so the right
  // top-N depends on the active column AND direction (top-N ascending is NOT the
  // reverse of top-N descending). Re-querying — cheap over the in-memory local
  // bundle — guarantees the visible set is the true top-N for this sort.
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

  // Copy a link that reproduces the current screen exactly (filters, sort, all).
  const share = async () => {
    const r = await copyToClipboard(shareUrl(req));
    setNlMsg(r === "copied" ? "Share link copied — anyone opening it sees this exact screen." : "Couldn't copy the link.");
  };

  // Toggle a preset in/out of the selection. The combined filters of every
  // selected preset are applied together (AND across them), so users can stack
  // scans — e.g. "Above 200-DMA" + "RSI below 30". Keeps the active sort/exchange.
  const togglePreset = (p: Preset) => {
    const next = new Set(selectedPresets);
    if (next.has(p.id)) next.delete(p.id);
    else next.add(p.id);
    setSelectedPresets(next);
    const chosen = PRESETS.filter((x) => next.has(x.id));
    const filters = chosen.flatMap((x) => x.request.filters);
    const nextReq: ScreenRequest = { ...req, filters, logic: "AND" };
    setReq(nextReq);
    run(nextReq);
    setNlMsg(
      chosen.length
        ? `Presets: ${chosen.map((x) => x.name).join(" + ")}`
        : "Presets cleared — showing the full universe.",
    );
  };
  const clearPresets = () => {
    setSelectedPresets(new Set());
    const nextReq: ScreenRequest = { ...req, filters: [] };
    setReq(nextReq);
    run(nextReq);
    setNlMsg("Presets cleared — showing the full universe.");
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

        <div className="presets">
          <button
            type="button"
            className="presets-toggle"
            onClick={() => setPresetsOpen((v) => !v)}
            aria-expanded={presetsOpen}
          >
            <span>Preset scans</span>
            {selectedPresets.size > 0 && (
              <span className="presets-badge">{selectedPresets.size}</span>
            )}
            <span className="presets-caret">{presetsOpen ? "▴" : "▾"}</span>
          </button>
          {presetsOpen && (
            <div className="presets-panel">
              {Object.entries(PRESET_GROUPS).map(([g, items]) => (
                <div className="presets-grp" key={g}>
                  <span className="presets-grp-label">{g}</span>
                  <div className="presets-row">
                    {items.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`preset-chip${selectedPresets.has(p.id) ? " on" : ""}`}
                        onClick={() => togglePreset(p)}
                        title={p.desc}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {selectedPresets.size > 0 && (
                <button type="button" className="presets-clear" onClick={clearPresets}>
                  Clear {selectedPresets.size} preset{selectedPresets.size === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}
        </div>

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
                <span className="f-field-wrap">
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
                  {fd?.desc && (
                    <span
                      className="f-info"
                      tabIndex={0}
                      role="note"
                      aria-label={`About ${fd.label}: ${fd.desc}`}
                    >
                      i
                      <span className="f-info-pop" role="tooltip">{fd.desc}</span>
                    </span>
                  )}
                </span>
                <select
                  className="f-op"
                  value={f.op}
                  onChange={(e) => {
                    const op = e.target.value as Operator;
                    // "between" owns value2, so it can't also carry a join condition.
                    setFilter(i, op === "between" ? { op, join: null } : { op });
                  }}
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
                {/* Optional second condition on the SAME field. Defaults to none.
                    Hidden for "between" (already a range). */}
                {f.op !== "between" && (
                  <select
                    className="f-join"
                    value={f.join ?? ""}
                    title="Add a second condition on this field"
                    onChange={(e) => {
                      const j = e.target.value as Logic | "";
                      setFilter(i, j ? { join: j, op2: f.op2 ?? "lt" } : { join: null });
                    }}
                  >
                    <option value="">—</option>
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                )}
                {f.op !== "between" && f.join && (
                  <>
                    <select
                      className="f-op"
                      value={f.op2 ?? "lt"}
                      onChange={(e) => setFilter(i, { op2: e.target.value as Operator })}
                    >
                      {OPS.filter((o) => o.value !== "between").map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      className="f-val mono"
                      type="number"
                      value={f.value2 ?? 0}
                      onChange={(e) => setFilter(i, { value2: Number(e.target.value) })}
                    />
                  </>
                )}
                <span className="f-unit">{fd?.unit ?? ""}</span>
                <button className="f-del" onClick={() => removeFilter(i)} title="Remove">
                  ✕
                </button>
              </div>
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
          <button className="btn-save" onClick={share} title="Copy a link that opens this exact screen">
            Share
          </button>
          <button className="btn-save" onClick={save}>Save screen</button>
          <button className="btn-run" onClick={() => run()} disabled={loading}>
            {loading ? "Running…" : "Run screen"}
          </button>
        </div>
      </div>

      <AdSlot label="Screener banner" height={70} name="screener" />

      <div className="results-head">
        <span className="results-count">
          <strong>{fmtInt(count)}</strong> matches
          {displayRows.length > 0 && (
            <span className="dim">
              {" "}· showing {fmtInt(page * pageSize + 1)}–
              {fmtInt(Math.min((page + 1) * pageSize, displayRows.length))}
            </span>
          )}
          {error && <span className="err">· {error}</span>}
        </span>
        <label className="per-page">
          <span>Rows</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
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
            {pageRows.map((m) => (
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
                <td className="mono">{fmtNum(m.rsi_14, 0)}</td>
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
                    title="Add to a watchlist"
                    onClick={(e) => watch(m, e)}
                  >
                    {isWatched(m.symbol) ? "★" : "☆"}
                  </button>
                  <button
                    className="ra-btn"
                    title="Open report"
                    onClick={() => setReportFor(m)}
                  >
                    Report
                  </button>
                </td>
              </tr>
            ))}
            {!displayRows.length && !loading && (
              <tr>
                <td colSpan={12} className="empty">No scrips match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="pager">
          <button
            className="pg-btn"
            disabled={page === 0}
            onClick={() => setPage(0)}
            title="First page"
          >
            «
          </button>
          <button
            className="pg-btn"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ‹ Prev
          </button>
          <span className="pg-info">
            Page {page + 1} of {fmtInt(pageCount)}
          </span>
          <button
            className="pg-btn"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next ›
          </button>
          <button
            className="pg-btn"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
            title="Last page"
          >
            »
          </button>
        </div>
      )}

      {reportFor && (
        <ReportView m={reportFor} data={{ aiText: null }} onClose={() => setReportFor(null)} />
      )}

      {wlMenu && (
        <WatchlistMenu
          item={wlMenu.item}
          anchor={wlMenu.rect}
          onClose={() => setWlMenu(null)}
        />
      )}
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
