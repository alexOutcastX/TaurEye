import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import { useColumns, type ColDef } from "../lib/columns";
import { ColumnMenu, ExportMenu } from "../components/TableTools";
import { hhi, zScores } from "../lib/portfolioMath";
import { computeRisk, loadBenchmark, type RiskResult } from "../lib/portfolioData";
import {
  addShares,
  createPortfolio,
  deletePortfolio,
  getPortfolios,
  onPortfolioChange,
  removePosition,
  renamePortfolio,
  seedFromWatchlist,
  upsertPosition,
  type Portfolio,
  type Position,
} from "../lib/portfolio";
import { getWatchlists } from "../lib/watchlist";
import type { Metrics } from "../api/types";
import type { DividendEvent } from "../data/snapshot";
import "./Portfolio.css";

interface Row {
  pos: Position;
  ltp: number;
  mv: number;
  invested: number;
  dayPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  weight: number;
  sector: string;
  cap: number | null;
}

const rupee = (n: number) => `₹${fmtNum(n, n >= 100000 || n <= -100000 ? 0 : 2)}`;

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

// Configurable columns for the Holdings table (Actions stays fixed, not here).
const PF_COLS: ColDef[] = [
  { key: "symbol", label: "Symbol", locked: true, align: "left" },
  { key: "qty", label: "Qty", align: "right" },
  { key: "avgCost", label: "Avg cost", align: "right" },
  { key: "ltp", label: "LTP", align: "right" },
  { key: "value", label: "Value", align: "right" },
  { key: "weight", label: "Wt", align: "right" },
  { key: "dayPnl", label: "Day P&L", align: "right" },
  { key: "totalPnl", label: "Total P&L", align: "right" },
];

export default function Portfolio() {
  const nav = useNavigate();
  const [metricsArr, setMetricsArr] = useState<Metrics[]>([]);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>(getPortfolios());
  const [activeId, setActiveId] = useState<string>(getPortfolios()[0]?.id ?? "default");
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [riskBusy, setRiskBusy] = useState(false);
  const [bench, setBench] = useState<Map<string, number> | null>(null);
  const [divs, setDivs] = useState<Map<string, DividendEvent[]>>(new Map());

  // add-holding form
  const [addSym, setAddSym] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addCost, setAddCost] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [symOpen, setSymOpen] = useState(false);
  const [symIdx, setSymIdx] = useState(0);
  const [importWl, setImportWl] = useState("");
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const holdingCols = useColumns("portfolio", PF_COLS);

  useEffect(() => onPortfolioChange(() => setPortfolios(getPortfolios())), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [idx, screen, dividends] = await Promise.all([
          api.indices(),
          api.screen({
            filters: [],
            logic: "AND",
            exchange: null,
            query: "",
            sort_by: "market_cap_cr",
            sort_dir: "desc",
            limit: 100000,
          }),
          api.dividends(),
        ]);
        if (!alive) return;
        setDataDate(idx.data_date ?? idx.generated_at ?? null);
        setMetricsArr(screen.results);
        setDivs(dividends);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const metricsMap = useMemo(() => {
    const m = new Map<string, Metrics>();
    for (const x of metricsArr) m.set(x.symbol, x);
    return m;
  }, [metricsArr]);

  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0];
  const positions = useMemo(() => active?.positions ?? [], [active]);

  const rows = useMemo<Row[]>(() => {
    const raw = positions.map((pos) => {
      const m = metricsMap.get(pos.symbol);
      const ltp = m?.close ?? pos.avgCost;
      const mv = pos.qty * ltp;
      const invested = pos.qty * pos.avgCost;
      const dayPnl = pos.qty * (m?.change_abs ?? 0);
      const totalPnl = mv - invested;
      return {
        pos,
        ltp,
        mv,
        invested,
        dayPnl,
        totalPnl,
        totalPnlPct: invested > 0 ? (totalPnl / invested) * 100 : 0,
        weight: 0,
        sector: m?.sector || "Unknown",
        cap: m?.market_cap_cr ?? null,
      };
    });
    const totalMV = raw.reduce((s, r) => s + r.mv, 0) || 1;
    for (const r of raw) r.weight = r.mv / totalMV;
    return raw.sort((a, b) => b.mv - a.mv);
  }, [positions, metricsMap]);

  const totals = useMemo(() => {
    const mv = rows.reduce((s, r) => s + r.mv, 0);
    const invested = rows.reduce((s, r) => s + r.invested, 0);
    const dayPnl = rows.reduce((s, r) => s + r.dayPnl, 0);
    const totalPnl = mv - invested;
    return {
      mv,
      invested,
      dayPnl,
      dayPct: mv - dayPnl > 0 ? (dayPnl / (mv - dayPnl)) * 100 : 0,
      totalPnl,
      totalPct: invested > 0 ? (totalPnl / invested) * 100 : 0,
    };
  }, [rows]);

  // ---- benchmark (cap-weighted broad market), loaded once after metrics ----
  useEffect(() => {
    if (!metricsArr.length) return;
    let alive = true;
    loadBenchmark(metricsArr).then((m) => alive && setBench(m));
    return () => {
      alive = false;
    };
  }, [metricsArr]);

  // ---- dividends → total return (₹ income since entry date × qty) ----
  const divInfo = useMemo(() => {
    let total = 0;
    for (const r of rows) {
      const evs = divs.get(r.pos.symbol);
      if (!evs?.length) continue;
      const since = r.pos.addedAt ? r.pos.addedAt.slice(0, 10) : null;
      let perShare = 0;
      for (const e of evs) if (!since || e.date >= since) perShare += e.amount;
      total += perShare * r.pos.qty;
    }
    const totalReturn = totals.totalPnl + total;
    return {
      total,
      totalReturn,
      totalReturnPct: totals.invested > 0 ? (totalReturn / totals.invested) * 100 : 0,
      has: divs.size > 0,
    };
  }, [rows, divs, totals]);

  // ---- risk (async, from candle history) ----
  useEffect(() => {
    let alive = true;
    const held = rows.filter((r) => r.weight > 0).map((r) => ({ symbol: r.pos.symbol, weight: r.weight }));
    if (held.length < 1) {
      setRisk(null);
      return;
    }
    setRiskBusy(true);
    computeRisk(held, bench ?? undefined)
      .then((res) => alive && setRisk(res))
      .finally(() => alive && setRiskBusy(false));
    return () => {
      alive = false;
    };
    // recompute when holdings/weights or the benchmark change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.pos.symbol}:${r.weight.toFixed(4)}`).join("|"), bench?.size ?? 0]);

  // ---- allocation by sector ----
  const sectors = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.sector, (map.get(r.sector) ?? 0) + r.weight);
    return [...map.entries()].map(([name, w]) => ({ name, w })).sort((a, b) => b.w - a.w);
  }, [rows]);

  const concentration = useMemo(() => {
    const ws = rows.map((r) => r.weight);
    return { hhi: hhi(ws), top: ws.length ? Math.max(...ws) : 0, n: rows.length };
  }, [rows]);

  // ---- factor tilt (weighted z-score vs the universe) ----
  const factors = useMemo(() => {
    if (!metricsArr.length || !rows.length) return [];
    const syms = metricsArr.map((m) => m.symbol);
    const proxies: Record<string, (number | null)[]> = {
      Momentum: metricsArr.map((m) => (Number.isFinite(m.pct_above_sma200) ? m.pct_above_sma200 : null)),
      Trend: metricsArr.map((m) => (Number.isFinite(m.pct_above_sma50) ? m.pct_above_sma50 : null)),
      "Low volatility": metricsArr.map((m) => (Number.isFinite(m.atr_pct) ? -m.atr_pct : null)),
      "Small cap": metricsArr.map((m) => (m.market_cap_cr && m.market_cap_cr > 0 ? -Math.log(m.market_cap_cr) : null)),
    };
    return Object.entries(proxies).map(([name, vals]) => {
      const z = zScores(vals);
      const zmap = new Map<string, number | null>();
      syms.forEach((s, i) => zmap.set(s, z[i]));
      let exp = 0;
      let wsum = 0;
      for (const r of rows) {
        const zz = zmap.get(r.pos.symbol);
        if (zz != null && r.weight > 0) {
          exp += r.weight * zz;
          wsum += r.weight;
        }
      }
      return { name, value: wsum > 0 ? exp / wsum : 0 };
    });
  }, [metricsArr, rows]);

  // ---- return attribution (contribution to total P&L) ----
  const attribution = useMemo(() => {
    const items = rows.map((r) => ({ symbol: r.pos.symbol, pnl: r.totalPnl, sector: r.sector }));
    const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.pnl)));
    const secMap = new Map<string, number>();
    for (const i of items) secMap.set(i.sector, (secMap.get(i.sector) ?? 0) + i.pnl);
    return {
      byHolding: [...items].sort((a, b) => b.pnl - a.pnl),
      maxAbs,
      bySector: [...secMap.entries()]
        .map(([name, pnl]) => ({ name, pnl }))
        .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)),
    };
  }, [rows]);

  // ---- risk contribution (share of portfolio volatility) ----
  const riskAttr = useMemo(() => {
    const rc = risk?.riskContrib ?? [];
    const wmap = new Map(rows.map((r) => [r.pos.symbol, r.weight]));
    const items = rc
      .map((x) => ({ symbol: x.symbol, pct: x.pct, weight: wmap.get(x.symbol) ?? 0 }))
      .sort((a, b) => b.pct - a.pct);
    return { items, max: Math.max(0.0001, ...items.map((i) => i.pct)) };
  }, [risk, rows]);

  // ---- symbol autocomplete (client-side over the loaded universe) ----
  const suggestions = useMemo(() => {
    const q = addSym.trim().toUpperCase();
    if (!q) return [] as Metrics[];
    const starts: Metrics[] = [];
    const contains: Metrics[] = [];
    const seen = new Set<string>();
    for (const m of metricsArr) {
      const sym = m.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      const name = (m.name || "").toUpperCase();
      if (sym.startsWith(q)) {
        starts.push(m);
        seen.add(sym);
      } else if (sym.includes(q) || name.includes(q)) {
        contains.push(m);
        seen.add(sym);
      }
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [addSym, metricsArr]);

  const pickSym = (m: Metrics) => {
    setAddSym(m.symbol);
    setSymOpen(false);
    setAddErr(null);
  };

  const onSymKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!symOpen || !suggestions.length) {
      if (e.key === "Enter") onAdd();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSymIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSymIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickSym(suggestions[Math.min(symIdx, suggestions.length - 1)]);
    } else if (e.key === "Escape") {
      setSymOpen(false);
    }
  };

  // ---- mutations ----
  const onAdd = () => {
    setAddErr(null);
    const sym = addSym.trim().toUpperCase();
    const m = metricsMap.get(sym);
    if (!m) {
      setAddErr(`“${sym}” isn't in the universe.`);
      return;
    }
    const qty = Number(addQty);
    const cost = addCost === "" ? m.close : Number(addCost);
    if (!(qty > 0) || !(cost >= 0)) {
      setAddErr("Enter a positive quantity and a valid cost.");
      return;
    }
    addShares(active.id, { symbol: sym, name: m.name, exchange: m.exchange }, qty, cost, addDate || undefined);
    setAddSym("");
    setAddQty("");
    setAddCost("");
    setAddDate("");
    setSymOpen(false);
  };

  const commit = (r: Row, patch: Partial<Position>) =>
    upsertPosition(active.id, { ...r.pos, ...patch });

  const openChart = (r: Row) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(r.pos.symbol)}` +
        `&name=${encodeURIComponent(r.pos.name)}&exchange=${encodeURIComponent(r.pos.exchange)}`,
    );

  // ---- Holdings table: display string + cell for each configurable column ----
  const pfText = (key: string, r: Row): string => {
    switch (key) {
      case "symbol": return r.pos.symbol;
      case "qty": return String(r.pos.qty);
      case "avgCost": return fmtNum(r.pos.avgCost);
      case "ltp": return fmtNum(r.ltp);
      case "value": return rupee(r.mv);
      case "weight": return `${(r.weight * 100).toFixed(1)}%`;
      case "dayPnl": return `${r.dayPnl >= 0 ? "+" : ""}${fmtInt(Math.round(r.dayPnl))}`;
      case "totalPnl": return `${r.totalPnl >= 0 ? "+" : ""}${fmtInt(Math.round(r.totalPnl))} (${fmtPct(r.totalPnlPct)})`;
      default: return "";
    }
  };
  const pfCell = (c: ColDef, r: Row) => {
    switch (c.key) {
      case "symbol":
        return (
          <td key={c.key}>
            <button className="pf-sym" onClick={() => openChart(r)}>{r.pos.symbol}</button>
            <span className="pf-sec">
              {r.sector}
              {r.pos.addedAt ? ` · since ${fmtDay(r.pos.addedAt)}` : ""}
            </span>
          </td>
        );
      case "qty":
        return (
          <td key={c.key} className="num">
            <input className="pf-in" type="number" min={0} defaultValue={r.pos.qty}
              onBlur={(e) => commit(r, { qty: Math.max(0, Number(e.target.value) || 0) })} />
          </td>
        );
      case "avgCost":
        return (
          <td key={c.key} className="num">
            <input className="pf-in" type="number" min={0} step="0.05" defaultValue={r.pos.avgCost}
              onBlur={(e) => commit(r, { avgCost: Math.max(0, Number(e.target.value) || 0) })} />
          </td>
        );
      case "ltp": return <td key={c.key} className="num mono">{fmtNum(r.ltp)}</td>;
      case "value": return <td key={c.key} className="num mono">{rupee(r.mv)}</td>;
      case "weight": return <td key={c.key} className="num mono">{(r.weight * 100).toFixed(1)}%</td>;
      case "dayPnl":
        return (
          <td key={c.key} className={`num mono ${signClass(r.dayPnl)}`}>
            {r.dayPnl >= 0 ? "+" : ""}{fmtInt(Math.round(r.dayPnl))}
          </td>
        );
      case "totalPnl":
        return (
          <td key={c.key} className={`num mono ${signClass(r.totalPnl)}`}>
            {r.totalPnl >= 0 ? "+" : ""}{fmtInt(Math.round(r.totalPnl))}
            <span className="pf-pnlpct">{fmtPct(r.totalPnlPct)}</span>
          </td>
        );
      default: return <td key={c.key} />;
    }
  };
  const pfExport = () => ({
    columns: holdingCols.visible.map((c) => ({ key: c.key, label: c.label, align: c.align })),
    rows: rows.map((r) => {
      const row: Record<string, string> = {};
      for (const c of holdingCols.visible) row[c.key] = pfText(c.key, r);
      return row;
    }),
  });

  const onImport = () => {
    if (!importWl) return;
    const p = seedFromWatchlist(importWl, (s) => metricsMap.get(s)?.close);
    if (p) setActiveId(p.id);
    setImportWl("");
  };

  // ---- CSV import / export ----
  const onExportCsv = () => {
    if (!active) return;
    const header = "symbol,quantity,avg_cost,date";
    const body = active.positions
      .map((p) => `${p.symbol},${p.qty},${p.avgCost},${p.addedAt ? p.addedAt.slice(0, 10) : ""}`)
      .join("\n");
    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.name.replace(/[^\w-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportCsv = async (file: File) => {
    setCsvMsg(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0;
    let skipped = 0;
    for (const line of lines) {
      const cells = line.split(",").map((c) => c.trim());
      const sym = (cells[0] || "").toUpperCase();
      if (!sym || sym === "SYMBOL") continue; // header / blank
      const m = metricsMap.get(sym);
      const qty = Number(cells[1]);
      const cost = cells[2] === "" || cells[2] == null ? m?.close ?? NaN : Number(cells[2]);
      if (!m || !(qty > 0) || !(cost >= 0)) {
        skipped++;
        continue;
      }
      addShares(active.id, { symbol: sym, name: m.name, exchange: m.exchange }, qty, cost, cells[3] || undefined);
      added++;
    }
    setCsvMsg(`Imported ${added} holding(s)${skipped ? `, skipped ${skipped}` : ""}.`);
  };

  // ---- multi-portfolio compare (cheap: from metrics, no candle fetches) ----
  const compare = useMemo(
    () =>
      portfolios.map((p) => {
        let mv = 0;
        let inv = 0;
        let day = 0;
        for (const pos of p.positions) {
          const m = metricsMap.get(pos.symbol);
          const ltp = m?.close ?? pos.avgCost;
          mv += pos.qty * ltp;
          inv += pos.qty * pos.avgCost;
          day += pos.qty * (m?.change_abs ?? 0);
        }
        return {
          id: p.id,
          name: p.name,
          n: p.positions.length,
          mv,
          day,
          pnl: mv - inv,
          pnlPct: inv > 0 ? ((mv - inv) / inv) * 100 : 0,
        };
      }),
    [portfolios, metricsMap],
  );

  const watchlists = getWatchlists();

  return (
    <section className="pf">
      <header className="pf-head">
        <div className="pf-title">
          <h1>Portfolio</h1>
          <span className="pf-asof">{dataDate ? `EOD · ${dataDate}` : "End-of-day"}</span>
        </div>
        <div className="pf-controls">
          <select value={active?.id} onChange={(e) => setActiveId(e.target.value)} className="pf-select">
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="pf-btn"
            onClick={() => {
              const name = window.prompt("New portfolio name", "My Portfolio");
              if (name) setActiveId(createPortfolio(name).id);
            }}
          >
            + New
          </button>
          <button
            className="pf-btn"
            onClick={() => {
              const name = window.prompt("Rename portfolio", active?.name);
              if (name && active) renamePortfolio(active.id, name);
            }}
          >
            Rename
          </button>
          {portfolios.length > 1 && (
            <button
              className="pf-btn danger"
              onClick={() => {
                if (active && window.confirm(`Delete “${active.name}”?`)) {
                  deletePortfolio(active.id);
                  setActiveId(getPortfolios()[0]?.id ?? "default");
                }
              }}
            >
              Delete
            </button>
          )}
          <button className="pf-btn" onClick={onExportCsv} title="Back up positions as CSV (re-importable)">
            ↓ CSV
          </button>
          <button className="pf-btn" onClick={() => fileRef.current?.click()} title="Import holdings from CSV">
            ↑ CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportCsv(f);
              e.target.value = "";
            }}
          />
          {rows.length > 0 && (
            <ExportMenu
              filename={`taureye-portfolio-${active?.name ?? "holdings"}`}
              title={`Portfolio — ${active?.name ?? ""}`}
              subtitle={`${rows.length} holding${rows.length === 1 ? "" : "s"}`}
              getData={pfExport}
            />
          )}
        </div>
      </header>
      {csvMsg && <p className="pf-csvmsg">{csvMsg}</p>}

      {/* ---- summary ---- */}
      <div className="pf-summary">
        <Stat label="Market value" value={rupee(totals.mv)} />
        <Stat label="Invested" value={rupee(totals.invested)} sub />
        <Stat
          label="Day P&L"
          value={`${totals.dayPnl >= 0 ? "+" : ""}${rupee(totals.dayPnl)}`}
          tone={signClass(totals.dayPnl)}
          extra={fmtPct(totals.dayPct)}
        />
        <Stat
          label="Total P&L"
          value={`${totals.totalPnl >= 0 ? "+" : ""}${rupee(totals.totalPnl)}`}
          tone={signClass(totals.totalPnl)}
          extra={fmtPct(totals.totalPct)}
        />
        {divInfo.has && (
          <Stat
            label="Dividends (est.)"
            value={`+${rupee(divInfo.total)}`}
            tone={divInfo.total > 0 ? "up" : undefined}
          />
        )}
        {divInfo.has && (
          <Stat
            label="Total return"
            value={`${divInfo.totalReturn >= 0 ? "+" : ""}${rupee(divInfo.totalReturn)}`}
            tone={signClass(divInfo.totalReturn)}
            extra={fmtPct(divInfo.totalReturnPct)}
          />
        )}
        <Stat
          label="Volatility (ann.)"
          value={risk ? `${(risk.annVol * 100).toFixed(1)}%` : riskBusy ? "…" : "—"}
        />
        <Stat
          label="1-day VaR 95%"
          value={risk ? rupee(risk.var95 * totals.mv) : riskBusy ? "…" : "—"}
          tone="down"
          extra={risk ? `${(risk.var95 * 100).toFixed(2)}%` : undefined}
        />
      </div>

      {compare.length > 1 && (
        <div className="pf-card">
          <h2 className="pf-card-title">Compare portfolios</h2>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Portfolio</th>
                  <th className="num">Holdings</th>
                  <th className="num">Value</th>
                  <th className="num">Day P&L</th>
                  <th className="num">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((c) => (
                  <tr key={c.id} className={c.id === active?.id ? "pf-active-row" : ""}>
                    <td>
                      <button className="pf-sym" onClick={() => setActiveId(c.id)}>
                        {c.name}
                      </button>
                    </td>
                    <td className="num mono">{c.n}</td>
                    <td className="num mono">{rupee(c.mv)}</td>
                    <td className={`num mono ${signClass(c.day)}`}>
                      {c.day >= 0 ? "+" : ""}
                      {fmtInt(Math.round(c.day))}
                    </td>
                    <td className={`num mono ${signClass(c.pnl)}`}>
                      {c.pnl >= 0 ? "+" : ""}
                      {fmtInt(Math.round(c.pnl))}
                      <span className="pf-pnlpct">{fmtPct(c.pnlPct)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p className="pf-empty">Loading market data…</p>
      ) : positions.length === 0 ? (
        <div className="pf-empty">
          <p>This portfolio is empty. Add a holding below, or import a watchlist.</p>
          {watchlists.length > 0 && (
            <div className="pf-import">
              <select value={importWl} onChange={(e) => setImportWl(e.target.value)} className="pf-select">
                <option value="">Import from watchlist…</option>
                {watchlists.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.items.length})
                  </option>
                ))}
              </select>
              <button className="pf-btn" onClick={onImport} disabled={!importWl}>
                Import
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ---- holdings ---- */}
          <div className="pf-card">
            <div className="pf-card-head">
              <h2 className="pf-card-title">Holdings</h2>
              {rows.length > 0 && (
                <div className="pf-toolbar">
                  <ColumnMenu defs={PF_COLS} prefs={holdingCols.prefs} onChange={holdingCols.setPrefs} onReset={holdingCols.reset} />
                </div>
              )}
            </div>
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    {holdingCols.visible.map((c) => (
                      <th key={c.key} className={c.align === "right" ? "num" : ""}>{c.label}</th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.pos.symbol}>
                      {holdingCols.visible.map((c) => pfCell(c, r))}
                      <td className="num">
                        <button className="pf-x" title="Remove" onClick={() => removePosition(active.id, r.pos.symbol)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* add holding */}
            <div className="pf-add">
              <div className="pf-ac">
                <input
                  className="pf-in sym"
                  placeholder="Symbol (e.g. RELIANCE)"
                  value={addSym}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setAddSym(e.target.value);
                    setSymOpen(true);
                    setSymIdx(0);
                  }}
                  onFocus={() => setSymOpen(true)}
                  onBlur={() => window.setTimeout(() => setSymOpen(false), 120)}
                  onKeyDown={onSymKey}
                />
                {symOpen && suggestions.length > 0 && (
                  <ul className="pf-ac-list">
                    {suggestions.map((m, i) => (
                      <li
                        key={`${m.symbol}:${m.exchange}`}
                        className={i === symIdx ? "active" : ""}
                        onMouseEnter={() => setSymIdx(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSym(m);
                        }}
                      >
                        <span className="pf-ac-sym">{m.symbol}</span>
                        <span className="pf-ac-name">{m.name}</span>
                        <span className="pf-ac-x">{m.exchange}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <input
                className="pf-in"
                type="number"
                placeholder="Qty"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
              />
              <input
                className="pf-in"
                type="number"
                placeholder="Avg cost (blank = LTP)"
                value={addCost}
                onChange={(e) => setAddCost(e.target.value)}
              />
              <input
                className="pf-in date"
                type="date"
                title="Trade date (optional)"
                max={dataDate ?? undefined}
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
              />
              <button className="pf-btn" onClick={onAdd}>
                Add
              </button>
              {addErr && <span className="pf-err">{addErr}</span>}
            </div>
          </div>

          <div className="pf-grid2">
            {/* allocation + concentration */}
            <div className="pf-card">
              <h2 className="pf-card-title">Allocation &amp; concentration</h2>
              <div className="pf-conc">
                <span>{concentration.n} holdings</span>
                <span>Top: {(concentration.top * 100).toFixed(1)}%</span>
                <span title="Herfindahl–Hirschman index — higher = more concentrated">
                  HHI {concentration.hhi.toFixed(2)}
                </span>
              </div>
              <div className="pf-alloc">
                {sectors.map((s) => (
                  <div key={s.name} className="pf-alloc-row">
                    <span className="pf-alloc-name">{s.name}</span>
                    <span className="pf-alloc-bar">
                      <span style={{ width: `${Math.min(100, s.w * 100)}%` }} />
                    </span>
                    <span className="pf-alloc-pct">{(s.w * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* risk */}
            <div className="pf-card">
              <h2 className="pf-card-title">Risk <ProTag /></h2>
              {risk ? (
                <>
                  <div className="pf-risk">
                    <RiskStat label="Annualized volatility" value={`${(risk.annVol * 100).toFixed(1)}%`} />
                    <RiskStat label="1-day VaR (95%)" value={`${(risk.var95 * 100).toFixed(2)}%`} sub={rupee(risk.var95 * totals.mv)} />
                    <RiskStat label="Expected shortfall (CVaR)" value={`${(risk.cvar95 * 100).toFixed(2)}%`} />
                    <RiskStat label="Max drawdown" value={`${(risk.maxDD * 100).toFixed(1)}%`} />
                    <RiskStat
                      label="Beta (vs market)"
                      value={risk.beta != null ? risk.beta.toFixed(2) : "—"}
                    />
                    <RiskStat
                      label="Tracking error"
                      value={risk.trackingError != null ? `${(risk.trackingError * 100).toFixed(1)}%` : "—"}
                    />
                    <RiskStat label="Best day" value={`+${(risk.best * 100).toFixed(2)}%`} tone="up" />
                    <RiskStat label="Worst day" value={`${(risk.worst * 100).toFixed(2)}%`} tone="down" />
                  </div>
                  <p className="pf-foot">
                    Historical, from {risk.days} trading days of overlapping EOD history. Beta/tracking error vs a
                    cap-weighted broad-market basket.
                  </p>
                </>
              ) : riskBusy ? (
                <p className="pf-muted">Computing risk from price history…</p>
              ) : (
                <p className="pf-muted">Add holdings with enough price history to see risk metrics.</p>
              )}
            </div>
          </div>

          {/* performance vs market */}
          {risk?.series && risk.series.length > 2 && (
            <div className="pf-card">
              <h2 className="pf-card-title">
                Performance vs market
                <span className="pf-legend">
                  <span className="pf-leg port">Portfolio {fmtPct(risk.series[risk.series.length - 1].port)}</span>
                  <span className="pf-leg bench">Market {fmtPct(risk.series[risk.series.length - 1].bench)}</span>
                </span>
              </h2>
              <PnlChart series={risk.series} />
              <p className="pf-foot">
                Cumulative return over the overlapping window vs a cap-weighted basket of the largest stocks
                (a broad-market proxy). Equal-weighted by market value at each point.
              </p>
            </div>
          )}

          {/* attribution */}
          <div className="pf-grid2">
            <div className="pf-card">
              <h2 className="pf-card-title">
                Return attribution <span className="pf-vs">contribution to P&amp;L</span> <ProTag />
              </h2>
              <div className="pf-factors pf-attr">
                {attribution.byHolding.map((h) => (
                  <div className="pf-factor" key={h.symbol}>
                    <span className="pf-factor-name">{h.symbol}</span>
                    <span className="pf-factor-track">
                      <span className="pf-factor-zero" />
                      <span
                        className={`pf-factor-fill ${h.pnl >= 0 ? "pos" : "neg"}`}
                        style={{
                          width: `${(Math.abs(h.pnl) / attribution.maxAbs) * 50}%`,
                          left: h.pnl >= 0 ? "50%" : `${50 - (Math.abs(h.pnl) / attribution.maxAbs) * 50}%`,
                        }}
                      />
                    </span>
                    <span className={`pf-factor-val ${signClass(h.pnl)}`}>
                      {h.pnl >= 0 ? "+" : ""}
                      {fmtInt(Math.round(h.pnl))}
                    </span>
                  </div>
                ))}
              </div>
              <p className="pf-foot">₹ profit/loss each holding contributes to the portfolio's total P&amp;L.</p>
            </div>

            <div className="pf-card">
              <h2 className="pf-card-title">
                Risk contribution <span className="pf-vs">share of volatility</span> <ProTag />
              </h2>
              {risk?.riskContrib ? (
                <div className="pf-alloc">
                  {riskAttr.items.map((it) => (
                    <div className="pf-alloc-row" key={it.symbol}>
                      <span className="pf-alloc-name">
                        {it.symbol} <span className="pf-wt">· {(it.weight * 100).toFixed(0)}% wt</span>
                      </span>
                      <span className="pf-alloc-bar">
                        <span style={{ width: `${Math.min(100, (it.pct / riskAttr.max) * 100)}%` }} />
                      </span>
                      <span className="pf-alloc-pct">{(it.pct * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pf-muted">
                  {riskBusy ? "Computing…" : "Add holdings with price history to see risk contribution."}
                </p>
              )}
              <p className="pf-foot">
                Each holding's share of total portfolio volatility. A high risk share at a low weight signals
                concentrated risk.
              </p>
            </div>
          </div>

          {/* factor tilt */}
          <div className="pf-card">
            <h2 className="pf-card-title">Factor tilt <span className="pf-vs">vs. universe</span> <ProTag /></h2>
            <div className="pf-factors">
              {factors.map((f) => {
                const pct = Math.max(-100, Math.min(100, (f.value / 2) * 100));
                return (
                  <div key={f.name} className="pf-factor">
                    <span className="pf-factor-name">{f.name}</span>
                    <span className="pf-factor-track">
                      <span className="pf-factor-zero" />
                      <span
                        className={`pf-factor-fill ${f.value >= 0 ? "pos" : "neg"}`}
                        style={{
                          width: `${Math.abs(pct) / 2}%`,
                          left: f.value >= 0 ? "50%" : `${50 - Math.abs(pct) / 2}%`,
                        }}
                      />
                    </span>
                    <span className={`pf-factor-val ${f.value >= 0 ? "up" : "down"}`}>
                      {f.value >= 0 ? "+" : ""}
                      {f.value.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="pf-foot">
              Standardized exposure (σ vs. the ~{fmtInt(metricsArr.length)}-stock universe). Value &amp; quality
              factors arrive with deeper fundamentals.
            </p>
          </div>
        </>
      )}

      <p className="pf-disclaimer">
        Portfolio tracking is <strong>informational and hypothetical</strong> — based on end-of-day prices, not a
        demat/broking account, and <strong>not investment advice</strong>. Dividends are <strong>estimated</strong>
        from public NSE announcements (cash payouts only). Figures may be delayed or inaccurate; verify against
        official sources.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  extra,
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  extra?: string;
  sub?: boolean;
}) {
  return (
    <div className={`pf-stat ${sub ? "muted" : ""}`}>
      <span className="pf-stat-l">{label}</span>
      <span className={`pf-stat-v ${tone ?? ""}`}>{value}</span>
      {extra && <span className={`pf-stat-x ${tone ?? ""}`}>{extra}</span>}
    </div>
  );
}

function PnlChart({ series }: { series: { date: string; port: number; bench: number }[] }) {
  const W = 600;
  const H = 170;
  const pad = 8;
  const n = series.length;
  const all = series.flatMap((p) => [p.port, p.bench]);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 0);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const path = (key: "port" | "bench") =>
    series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pf-chart" preserveAspectRatio="none" role="img" aria-label="Cumulative return vs market">
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="pf-chart-zero" />
      <path d={path("bench")} className="pf-chart-bench" />
      <path d={path("port")} className="pf-chart-port" />
    </svg>
  );
}

function ProTag() {
  return (
    <span className="pf-pro" title="Advanced analytics — free during preview, a Pro feature at launch">
      Pro
    </span>
  );
}

function RiskStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="pf-rstat">
      <span className="pf-rstat-l">{label}</span>
      <span className={`pf-rstat-v ${tone ?? ""}`}>{value}</span>
      {sub && <span className="pf-rstat-s">{sub}</span>}
    </div>
  );
}
