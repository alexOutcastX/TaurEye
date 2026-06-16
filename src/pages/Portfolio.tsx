import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import { hhi, zScores } from "../lib/portfolioMath";
import { computeRisk, type RiskResult } from "../lib/portfolioData";
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

export default function Portfolio() {
  const nav = useNavigate();
  const [metricsArr, setMetricsArr] = useState<Metrics[]>([]);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>(getPortfolios());
  const [activeId, setActiveId] = useState<string>(getPortfolios()[0]?.id ?? "default");
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [riskBusy, setRiskBusy] = useState(false);

  // add-holding form
  const [addSym, setAddSym] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addCost, setAddCost] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [importWl, setImportWl] = useState("");

  useEffect(() => onPortfolioChange(() => setPortfolios(getPortfolios())), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [idx, screen] = await Promise.all([
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
        ]);
        if (!alive) return;
        setDataDate(idx.data_date ?? idx.generated_at ?? null);
        setMetricsArr(screen.results);
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

  // ---- risk (async, from candle history) ----
  useEffect(() => {
    let alive = true;
    const held = rows.filter((r) => r.weight > 0).map((r) => ({ symbol: r.pos.symbol, weight: r.weight }));
    if (held.length < 1) {
      setRisk(null);
      return;
    }
    setRiskBusy(true);
    computeRisk(held)
      .then((res) => alive && setRisk(res))
      .finally(() => alive && setRiskBusy(false));
    return () => {
      alive = false;
    };
    // recompute when the set of symbols or their weights change materially
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.pos.symbol}:${r.weight.toFixed(4)}`).join("|")]);

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
  };

  const commit = (r: Row, patch: Partial<Position>) =>
    upsertPosition(active.id, { ...r.pos, ...patch });

  const openChart = (r: Row) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(r.pos.symbol)}` +
        `&name=${encodeURIComponent(r.pos.name)}&exchange=${encodeURIComponent(r.pos.exchange)}`,
    );

  const onImport = () => {
    if (!importWl) return;
    const p = seedFromWatchlist(importWl, (s) => metricsMap.get(s)?.close);
    if (p) setActiveId(p.id);
    setImportWl("");
  };

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
        </div>
      </header>

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
            <h2 className="pf-card-title">Holdings</h2>
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="num">Qty</th>
                    <th className="num">Avg cost</th>
                    <th className="num">LTP</th>
                    <th className="num">Value</th>
                    <th className="num">Wt</th>
                    <th className="num">Day P&L</th>
                    <th className="num">Total P&L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.pos.symbol}>
                      <td>
                        <button className="pf-sym" onClick={() => openChart(r)}>
                          {r.pos.symbol}
                        </button>
                        <span className="pf-sec">
                          {r.sector}
                          {r.pos.addedAt ? ` · since ${fmtDay(r.pos.addedAt)}` : ""}
                        </span>
                      </td>
                      <td className="num">
                        <input
                          className="pf-in"
                          type="number"
                          min={0}
                          defaultValue={r.pos.qty}
                          onBlur={(e) => commit(r, { qty: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </td>
                      <td className="num">
                        <input
                          className="pf-in"
                          type="number"
                          min={0}
                          step="0.05"
                          defaultValue={r.pos.avgCost}
                          onBlur={(e) => commit(r, { avgCost: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </td>
                      <td className="num mono">{fmtNum(r.ltp)}</td>
                      <td className="num mono">{rupee(r.mv)}</td>
                      <td className="num mono">{(r.weight * 100).toFixed(1)}%</td>
                      <td className={`num mono ${signClass(r.dayPnl)}`}>
                        {r.dayPnl >= 0 ? "+" : ""}
                        {fmtInt(Math.round(r.dayPnl))}
                      </td>
                      <td className={`num mono ${signClass(r.totalPnl)}`}>
                        {r.totalPnl >= 0 ? "+" : ""}
                        {fmtInt(Math.round(r.totalPnl))}
                        <span className="pf-pnlpct">{fmtPct(r.totalPnlPct)}</span>
                      </td>
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
              <input
                className="pf-in sym"
                placeholder="Symbol (e.g. RELIANCE)"
                value={addSym}
                onChange={(e) => setAddSym(e.target.value)}
              />
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
              <h2 className="pf-card-title">Risk</h2>
              {risk ? (
                <>
                  <div className="pf-risk">
                    <RiskStat label="Annualized volatility" value={`${(risk.annVol * 100).toFixed(1)}%`} />
                    <RiskStat label="1-day VaR (95%)" value={`${(risk.var95 * 100).toFixed(2)}%`} sub={rupee(risk.var95 * totals.mv)} />
                    <RiskStat label="Expected shortfall (CVaR)" value={`${(risk.cvar95 * 100).toFixed(2)}%`} />
                    <RiskStat label="Max drawdown" value={`${(risk.maxDD * 100).toFixed(1)}%`} />
                    <RiskStat label="Best day" value={`+${(risk.best * 100).toFixed(2)}%`} tone="up" />
                    <RiskStat label="Worst day" value={`${(risk.worst * 100).toFixed(2)}%`} tone="down" />
                  </div>
                  <p className="pf-foot">Historical, from {risk.days} trading days of overlapping EOD history.</p>
                </>
              ) : riskBusy ? (
                <p className="pf-muted">Computing risk from price history…</p>
              ) : (
                <p className="pf-muted">Add holdings with enough price history to see risk metrics.</p>
              )}
            </div>
          </div>

          {/* factor tilt */}
          <div className="pf-card">
            <h2 className="pf-card-title">Factor tilt <span className="pf-vs">vs. universe</span></h2>
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
        demat/broking account, and <strong>not investment advice</strong>. Figures may be delayed or inaccurate;
        verify against official sources.
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

function RiskStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="pf-rstat">
      <span className="pf-rstat-l">{label}</span>
      <span className={`pf-rstat-v ${tone ?? ""}`}>{value}</span>
      {sub && <span className="pf-rstat-s">{sub}</span>}
    </div>
  );
}
