import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import { getWatchlists, onWatchlistChange, type Watchlist } from "../lib/watchlist";
import BullMark from "../components/BullMark";
import BrokerCTA from "../components/BrokerCTA";
import ErrorBoundary from "../components/ErrorBoundary";
import type { IndexQuote, Metrics } from "../api/types";
import "./Dashboard.css";

// three.js is heavy — lazy-load it so it stays out of the app bundle. BullScene
// itself falls back to the static BullMark if WebGL is unavailable on the device.
const BullScene = lazy(() => import("../components/BullScene"));

// Animated count-up for the hero stats (eased, ~0.9s).
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setV(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// Heatmap tile colour: green for gains, red for losses, intensity by magnitude.
function heat(pct: number): string {
  const clamped = Math.max(-3, Math.min(3, pct)) / 3; // -1..1
  const a = 0.12 + Math.abs(clamped) * 0.5;
  return clamped >= 0
    ? `rgba(24, 201, 140, ${a.toFixed(3)})`
    : `rgba(240, 80, 110, ${a.toFixed(3)})`;
}

interface Sector {
  name: string;
  avg: number;
  count: number;
}

export default function Dashboard() {
  const nav = useNavigate();
  const [metrics, setMetrics] = useState<Metrics[] | null>(null);
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<Watchlist[]>(getWatchlists());
  const [greet] = useState(greeting);

  useEffect(() => onWatchlistChange(() => setLists(getWatchlists())), []);

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
        setIndices(idx.indices || []);
        setDataDate(idx.data_date ?? idx.generated_at ?? null);
        setMetrics(screen.results);
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Equity-only universe for breadth/movers/sectors (excludes ETFs/SME noise).
  const eq = useMemo(
    () => (metrics ?? []).filter((m) => (m.segment || "EQ") === "EQ"),
    [metrics],
  );

  const breadth = useMemo(() => {
    let up = 0,
      down = 0,
      flat = 0;
    for (const m of eq) {
      if (m.change_pct > 0) up++;
      else if (m.change_pct < 0) down++;
      else flat++;
    }
    return { up, down, flat, total: eq.length || 1 };
  }, [eq]);

  // Liquid movers only, so the lists aren't dominated by illiquid microcaps.
  const liquid = useMemo(
    () => eq.filter((m) => m.market_cap_cr != null && m.volume > 50000 && Number.isFinite(m.change_pct)),
    [eq],
  );
  const gainers = useMemo(
    () => [...liquid].sort((a, b) => b.change_pct - a.change_pct).slice(0, 6),
    [liquid],
  );
  const losers = useMemo(
    () => [...liquid].sort((a, b) => a.change_pct - b.change_pct).slice(0, 6),
    [liquid],
  );

  const sectors = useMemo<Sector[]>(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const m of eq) {
      const s = m.sector || "Unknown";
      if (!Number.isFinite(m.change_pct)) continue;
      const cur = map.get(s) || { sum: 0, n: 0 };
      cur.sum += m.change_pct;
      cur.n += 1;
      map.set(s, cur);
    }
    return [...map.entries()]
      .filter(([, v]) => v.n >= 5)
      .map(([name, v]) => ({ name, avg: v.sum / v.n, count: v.n }))
      .sort((a, b) => b.avg - a.avg);
  }, [eq]);

  // Index cards: NIFTY / BANK NIFTY / SENSEX / VIX-style — domestic first.
  const indexCards = useMemo(() => {
    const score = (i: IndexQuote) => {
      const k = `${i.key} ${i.label}`.toUpperCase();
      if (k.includes("VIX")) return 0;
      if (i.category === "domestic") return 1;
      if (i.category === "currency") return 2;
      return 3;
    };
    return [...indices]
      .filter((i) => i.value != null && i.category !== "international")
      .sort((a, b) => score(a) - score(b))
      .slice(0, 6);
  }, [indices]);

  const openChart = (m: { symbol: string; name: string; exchange: string }) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(m.symbol)}` +
        `&name=${encodeURIComponent(m.name)}&exchange=${encodeURIComponent(m.exchange)}`,
    );

  const loading = metrics === null && !error;

  const upCount = useCountUp(breadth.up);
  const downCount = useCountUp(breadth.down);
  const universe = useCountUp(metrics?.length ?? 0);

  const upPct = (breadth.up / breadth.total) * 100;
  const downPct = (breadth.down / breadth.total) * 100;
  const flatPct = 100 - upPct - downPct;
  const ratio = breadth.down ? breadth.up / breadth.down : breadth.up;

  return (
    <section className="dash">
      {/* ---- hero ---- */}
      <div className="dash-hero">
        <div className="dash-hero-copy">
          <span className="dash-greet">{greet}</span>
          <h1>
            Market <span className="dash-accent">Pulse</span>
          </h1>
          <p className="dash-asof">
            {dataDate ? `End-of-day data · ${dataDate}` : "End-of-day market overview"}
          </p>
          <div className="dash-stats">
            <div className="dash-stat">
              <span className="dash-stat-n">{fmtInt(Math.round(universe))}</span>
              <span className="dash-stat-l">Stocks tracked</span>
            </div>
            <div className="dash-stat up">
              <span className="dash-stat-n">{fmtInt(Math.round(upCount))}</span>
              <span className="dash-stat-l">Advancing</span>
            </div>
            <div className="dash-stat down">
              <span className="dash-stat-n">{fmtInt(Math.round(downCount))}</span>
              <span className="dash-stat-l">Declining</span>
            </div>
          </div>
        </div>
        <div className="dash-hero-bull">
          <ErrorBoundary fallback={<BullMark size={150} />}>
            <Suspense fallback={<BullMark size={150} />}>
              <BullScene className="dash-bull3d" />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      {error && <p className="dash-error">Couldn’t load market data. {error}</p>}

      {/* ---- index cards ---- */}
      {indexCards.length > 0 && (
        <div className="dash-indices">
          {indexCards.map((i) => (
            <div key={i.key} className={`dash-idx ${signClass(i.change_pct ?? 0)}`}>
              <span className="dash-idx-label">{i.label}</span>
              <span className="dash-idx-value">{i.value != null ? fmtNum(i.value) : "—"}</span>
              <span className={`dash-idx-chg ${signClass(i.change_pct ?? 0)}`}>
                {i.change_pct != null ? fmtPct(i.change_pct) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="dash-loading">Loading market data…</div>
      ) : (
        <>
          {/* ---- breadth + sectors ---- */}
          <div className="dash-grid2">
            <div className="dash-card">
              <h2 className="dash-card-title">Market breadth</h2>
              <div className="dash-breadth-nums">
                <span className="up">{fmtInt(breadth.up)} up</span>
                <span className="dim">A/D {ratio.toFixed(2)}</span>
                <span className="down">{fmtInt(breadth.down)} down</span>
              </div>
              <div className="dash-breadth-bar">
                <span className="seg up" style={{ width: `${upPct}%` }} />
                <span className="seg flat" style={{ width: `${flatPct}%` }} />
                <span className="seg down" style={{ width: `${downPct}%` }} />
              </div>
              <p className="dash-card-foot">
                {upPct >= downPct
                  ? `Advancers lead — ${upPct.toFixed(0)}% of equities are green.`
                  : `Decliners lead — ${downPct.toFixed(0)}% of equities are red.`}
              </p>
            </div>

            <div className="dash-card">
              <h2 className="dash-card-title">Sector heatmap</h2>
              <div className="dash-heat">
                {sectors.slice(0, 12).map((s) => (
                  <div
                    key={s.name}
                    className="dash-heat-tile"
                    style={{ background: heat(s.avg) }}
                    title={`${s.name} · ${s.count} stocks · avg ${fmtPct(s.avg)}`}
                  >
                    <span className="dash-heat-name">{s.name}</span>
                    <span className={`dash-heat-pct ${signClass(s.avg)}`}>{fmtPct(s.avg)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ---- movers ---- */}
          <div className="dash-grid2">
            <MoverList title="Top gainers" rows={gainers} onOpen={openChart} kind="up" />
            <MoverList title="Top losers" rows={losers} onOpen={openChart} kind="down" />
          </div>

          {/* ---- watchlist snapshot ---- */}
          <div className="dash-card dash-wl">
            <div className="dash-wl-head">
              <h2 className="dash-card-title">Your watchlists</h2>
              <button className="dash-link" onClick={() => nav("/app/watchlist")}>
                Open →
              </button>
            </div>
            <div className="dash-wl-chips">
              {lists.map((l) => (
                <button key={l.id} className="dash-wl-chip" onClick={() => nav("/app/watchlist")}>
                  {l.name}
                  <span>{l.items.length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ---- broker affiliate partners (hidden until a link is set) ---- */}
          <BrokerCTA />
        </>
      )}
    </section>
  );
}

function MoverList({
  title,
  rows,
  onOpen,
  kind,
}: {
  title: string;
  rows: Metrics[];
  onOpen: (m: Metrics) => void;
  kind: "up" | "down";
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.change_pct)));
  return (
    <div className="dash-card">
      <h2 className="dash-card-title">{title}</h2>
      <div className="dash-movers">
        {rows.length === 0 && <p className="dim">No data.</p>}
        {rows.map((m) => (
          <button key={`${m.exchange}:${m.symbol}`} className="dash-mover" onClick={() => onOpen(m)}>
            <span className="dash-mover-bar-wrap">
              <span
                className={`dash-mover-bar ${kind}`}
                style={{ width: `${(Math.abs(m.change_pct) / max) * 100}%` }}
              />
            </span>
            <span className="dash-mover-sym">{m.symbol}</span>
            <span className="dash-mover-px mono">{fmtNum(m.close)}</span>
            <span className={`dash-mover-chg mono ${signClass(m.change_pct)}`}>
              {fmtPct(m.change_pct)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
