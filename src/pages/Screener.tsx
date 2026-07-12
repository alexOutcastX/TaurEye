import { useEffect, useMemo, useRef, useState } from "react";
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
import { useColumns, type ColDef } from "../lib/columns";
import { ColumnMenu, ExportMenu } from "../components/TableTools";
import { computeSR, EMPTY_SR, SR_KEYS, type SR, type SRKey } from "../lib/supportResistance";
import AdSlot from "../components/AdSlot";
import { parseScreen } from "../lib/nlScreen";
import { spend } from "../lib/economy";
import { COSTS } from "../lib/economy";
import { PRESETS, type Preset } from "../config/presets";
import { decodeScreen, shareUrl } from "../lib/shareScreen";
import { copyToClipboard } from "../lib/referral";
import { track } from "../lib/analytics";
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

// Configurable result columns. Keys are metric fields (so cells + sort + export
// all key off the same name). Extra metric columns (200 DMA, ATR, 52w-low, MACD,
// and the daily/weekly/monthly support & resistance) are hidden by default — the
// Columns menu lets users add them.
type ScrCol = ColDef & { sortable?: boolean; thClass?: string };
const SCR_COLS: ScrCol[] = [
  { key: "symbol", label: "Symbol", locked: true, align: "left", sortable: true },
  { key: "name", label: "Name", align: "left", thClass: "left col-name" },
  { key: "exchange", label: "Exch", align: "left" },
  { key: "close", label: "LTP", align: "right", sortable: true },
  { key: "change_pct", label: "% Chg", align: "right", sortable: true },
  { key: "volume", label: "Volume", align: "right", sortable: true },
  { key: "rel_volume", label: "Rel Vol", align: "right", sortable: true },
  { key: "rsi_14", label: "RSI", align: "right", sortable: true },
  { key: "pct_above_sma50", label: "vs 50DMA", align: "right", sortable: true },
  { key: "pct_above_sma200", label: "vs 200DMA", align: "right", sortable: true, defaultHidden: true },
  { key: "dist_52w_high_pct", label: "52w Hi", align: "right", sortable: true },
  { key: "dist_52w_low_pct", label: "52w Lo", align: "right", sortable: true, defaultHidden: true },
  { key: "atr_pct", label: "ATR %", align: "right", sortable: true, defaultHidden: true },
  { key: "macd_hist", label: "MACD", align: "right", sortable: true, defaultHidden: true },
  { key: "market_cap_cr", label: "Mkt Cap", align: "right", sortable: true },
  { key: "dist_sup_d_pct", label: "Sup D", align: "right", sortable: true, defaultHidden: true },
  { key: "dist_res_d_pct", label: "Res D", align: "right", sortable: true, defaultHidden: true },
  { key: "dist_sup_w_pct", label: "Sup W", align: "right", sortable: true, defaultHidden: true },
  { key: "dist_res_w_pct", label: "Res W", align: "right", sortable: true, defaultHidden: true },
  { key: "dist_sup_m_pct", label: "Sup M", align: "right", sortable: true, defaultHidden: true },
  { key: "dist_res_m_pct", label: "Res M", align: "right", sortable: true, defaultHidden: true },
];
const SCR_BY_KEY = new Map(SCR_COLS.map((c) => [c.key, c]));

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
  const cols = useColumns("screener", SCR_COLS);
  // Support/resistance computed locally from candles (fills the Sup/Res D/W/M
  // columns even when the published metrics.json doesn't carry them yet).
  const [srMap, setSrMap] = useState<Map<string, SR>>(new Map());
  const srFetched = useRef<Set<string>>(new Set());

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

  // Any support/resistance column showing? Then compute S/R locally (from
  // candles) for the visible rows that the bundle doesn't already carry.
  const srVisible = useMemo(
    () => cols.visible.some((c) => c.key.startsWith("dist_sup_") || c.key.startsWith("dist_res_")),
    [cols.visible],
  );
  useEffect(() => {
    if (!srVisible) return;
    let alive = true;
    const need = pageRows.filter(
      (m) => (m as unknown as Record<string, unknown>).dist_sup_d_pct == null && !srFetched.current.has(m.symbol),
    );
    need.forEach((m) => srFetched.current.add(m.symbol));
    if (!need.length) return;
    const queue = [...need];
    const worker = async () => {
      while (queue.length && alive) {
        const m = queue.shift()!;
        let sr: SR;
        try {
          sr = computeSR(await api.candles(m.symbol, 800));
        } catch {
          sr = EMPTY_SR;
        }
        if (alive) setSrMap((prev) => new Map(prev).set(m.symbol, sr));
      }
    };
    // limited concurrency so a page of 100 doesn't fire 100 fetches at once
    void Promise.all(Array.from({ length: 6 }, worker));
    return () => {
      alive = false;
    };
  }, [srVisible, pageRows]);

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
      track("screen_run", { filters: r.filters.length, results: res.count });
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
      setNlMsg(
        "Couldn't recognise that yet — try e.g. \"rsi below 30 and price above 200 dma\", " +
          "\"near weekly support\", \"market cap over 5000 cr\", \"golden cross with volume spike\", " +
          "\"within 3% of 52 week high\", \"% from resistance between -2 and 0\".",
      );
      return;
    }
    setReq((r) => ({
      ...r,
      filters: parsed.filters,
      logic: parsed.logic,
      segments: parsed.segments ?? r.segments,
    }));
    const ignored = parsed.unrecognized.length
      ? `  ·  Ignored: ${parsed.unrecognized.join(", ")}`
      : "";
    setNlMsg(`Understood (${parsed.logic}): ${parsed.recognized.join(" · ")}${ignored}`);
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

  // Share a link that reproduces the current screen exactly (filters, sort, all).
  // Prefers the native OS share sheet (APK + mobile browsers) so a "nice combo"
  // can go straight to WhatsApp/Telegram/etc.; falls back to copying the link.
  const share = async () => {
    const url = shareUrl(req);
    const title = "TaurEye stock screen";
    // Include the screened scrips themselves (top of the current sort) so the
    // message lists the actual stocks, plus the link that reproduces the screen.
    const SHOWN = 25;
    const symbols = displayRows.slice(0, SHOWN).map((r) => r.symbol);
    const more = count > symbols.length ? ` +${count - symbols.length} more` : "";
    const text =
      symbols.length > 0
        ? `${count} stocks on this TaurEye screen:\n${symbols.join(", ")}${more}`
        : "Check out this stock screen on TaurEye";

    // Native app: Capacitor Share opens the OS share sheet.
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title, text, url, dialogTitle: "Share this screen" });
        return;
      }
    } catch {
      /* fall through to web sharing */
    }

    // Web: use the Web Share API where supported (most mobile browsers).
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user dismissed the sheet
        // otherwise fall back to clipboard below
      }
    }

    // Fallback (desktop without share support): copy the scrips + link.
    const r = await copyToClipboard(`${text}\n${url}`);
    setNlMsg(r === "copied" ? "Copied the screened stocks + a link to this exact screen." : "Couldn't copy.");
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

  // ---- results table: display string + cell for each configurable column ----
  const scrText = (key: string, m: Metrics): string => {
    switch (key) {
      case "symbol": return m.symbol;
      case "name": return m.name;
      case "exchange": return m.exchange;
      case "close": return fmtNum(m.close);
      case "change_pct": return fmtPct(m.change_pct);
      case "volume": return fmtInt(m.volume);
      case "rel_volume": return `${fmtNum(m.rel_volume)}x`;
      case "rsi_14": return fmtNum(m.rsi_14, 0);
      case "market_cap_cr": return fmtCap(m.market_cap_cr);
      case "macd_hist": return fmtNum(m.macd_hist, 2);
      default: {
        let v = (m as unknown as Record<string, number | null | undefined>)[key];
        if (v == null && SR_KEYS.includes(key as SRKey)) v = srMap.get(m.symbol)?.[key as SRKey] ?? null;
        return v == null ? "" : fmtPct(v);
      }
    }
  };
  const scrCell = (c: ColDef, m: Metrics) => {
    switch (c.key) {
      case "symbol":
        return (
          <td key={c.key} className="left sym">
            <button type="button" className="sym-link" onClick={() => openChart(m)} title={`${m.name} — open details`}>
              {m.symbol}
            </button>
          </td>
        );
      case "name": return <td key={c.key} className="left name col-name">{m.name}</td>;
      case "exchange": return <td key={c.key} className="dim">{m.exchange}</td>;
      case "close": return <td key={c.key} className="mono">{fmtNum(m.close)}</td>;
      case "change_pct": return <td key={c.key} className={`mono ${signClass(m.change_pct)}`}>{fmtPct(m.change_pct)}</td>;
      case "volume": return <td key={c.key} className="mono dim">{fmtInt(m.volume)}</td>;
      case "rel_volume": return <td key={c.key} className="mono">{fmtNum(m.rel_volume)}x</td>;
      case "rsi_14": return <td key={c.key} className="mono">{fmtNum(m.rsi_14, 0)}</td>;
      case "market_cap_cr": return <td key={c.key} className="mono">{fmtCap(m.market_cap_cr)}</td>;
      case "macd_hist": return <td key={c.key} className="mono">{fmtNum(m.macd_hist, 2)}</td>;
      default: {
        let v = (m as unknown as Record<string, number | null | undefined>)[c.key];
        if (v == null && SR_KEYS.includes(c.key as SRKey)) {
          const sr = srMap.get(m.symbol);
          if (sr) v = sr[c.key as SRKey];
          else if (srVisible) return <td key={c.key} className="mono dim">…</td>; // computing
        }
        return (
          <td key={c.key} className={`mono ${typeof v === "number" ? signClass(v) : ""}`}>
            {v == null ? "—" : fmtPct(v)}
          </td>
        );
      }
    }
  };
  const buildScrExport = () => ({
    columns: cols.visible.map((c) => ({ key: c.key, label: c.label, align: c.align })),
    rows: displayRows.map((m) => {
      const row: Record<string, string> = {};
      for (const c of cols.visible) row[c.key] = scrText(c.key, m);
      return row;
    }),
  });

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
              onChange={(e) => {
                // An exchange switch re-scopes the whole universe, so run it
                // immediately (like a column sort) rather than waiting for Run.
                const next = { ...req, exchange: (e.target.value || null) as Exchange | null };
                setReq(next);
                run(next);
              }}
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
                <NumField
                  className="f-val mono"
                  value={f.value}
                  onChange={(v) => setFilter(i, { value: v })}
                />
                {f.op === "between" && (
                  <NumField
                    className="f-val mono"
                    value={f.value2 ?? 0}
                    onChange={(v) => setFilter(i, { value2: v })}
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
                    <NumField
                      className="f-val mono"
                      value={f.value2 ?? 0}
                      onChange={(v) => setFilter(i, { value2: v })}
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
          <button className="btn-save" onClick={share} title="Share the screened stocks + a link that opens this exact screen">
            Share
          </button>
          <button className="btn-save" onClick={save}>Save screen</button>
          <button className="btn-run" onClick={() => run()} disabled={loading}>
            {loading ? "Running…" : "Run screen"}
          </button>
        </div>
      </div>

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
        <div className="results-actions">
          <ColumnMenu defs={SCR_COLS} prefs={cols.prefs} onChange={cols.setPrefs} onReset={cols.reset} />
          <ExportMenu
            filename="taureye-screen"
            title="Screener"
            subtitle={`${fmtInt(count)} matches`}
            getData={buildScrExport}
          />
          <label className="per-page">
            <span>Rows</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[20, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              {cols.visible.map((c) => {
                const sc = SCR_BY_KEY.get(c.key);
                return sc?.sortable ? (
                  <Th key={c.key} k={c.key} req={req} onSort={sortBy} align={c.align === "left" ? "left" : "right"}>
                    {c.label}
                  </Th>
                ) : (
                  <th key={c.key} className={sc?.thClass ?? (c.align === "left" ? "left" : "")}>{c.label}</th>
                );
              })}
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && pageRows.length === 0 &&
              Array.from({ length: 12 }).map((_, r) => (
                <tr key={`sk-${r}`} className="skeleton-row" aria-hidden="true">
                  {cols.visible.map((c) => (
                    <td key={c.key} className={c.align === "left" ? "left" : ""}>
                      <span className="sk-cell" />
                    </td>
                  ))}
                  <td className="row-actions">
                    <span className="sk-cell" />
                  </td>
                </tr>
              ))}
            {pageRows.map((m) => (
              <tr key={`${m.exchange}:${m.symbol}`}>
                {cols.visible.map((c) => scrCell(c, m))}
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
                <td colSpan={cols.visible.length + 1} className="empty">No scrips match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Banner sits BELOW the results so the dense table fills the space right
          under the filters — an unfilled ad unit never wedges a blank gap. */}
      <AdSlot label="Screener banner" height={70} name="screener" />

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

// A numeric filter input that — unlike a raw <input type="number"> — lets you
// CLEAR the field and type NEGATIVE / decimal values (e.g. "% from 52w High < -20").
// It mirrors the numeric value as editable text, commits a parsed number on each
// valid keystroke, and treats an empty / lone-minus field as 0.
function NumField({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? String(v) : "");
  const [str, setStr] = useState<string>(() => fmt(value));

  // Re-sync when the value changes from OUTSIDE (preset / NL load), but keep the
  // user's in-progress text ("", "-", a trailing ".") so editing isn't clobbered.
  useEffect(() => {
    setStr((prev) =>
      prev === "" || prev === "-" || prev.endsWith(".")
        ? prev
        : Number(prev) === value
          ? prev
          : fmt(value),
    );
  }, [value]);

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={str}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(raw)) return; // accept only a decimal-in-progress
        setStr(raw);
        const n = raw === "" || raw === "-" || raw === "." || raw === "-." ? 0 : Number(raw);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}
