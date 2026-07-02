import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { IndexQuote, IndicesResponse } from "../api/types";
import { fmtNum, fmtPct, fmtStamp, signClass } from "../lib/format";
import { openExternal, tradingViewUrl } from "../lib/tradingview";
import { getFxRates, convert, FX_PAIRS, type FxRates } from "../lib/fx";
import "./GlobalIndices.css";

type Cat = "domestic" | "international" | "currency" | "depository";

const TABS: { cat: Cat; label: string; sub?: string; empty: string }[] = [
  {
    cat: "domestic",
    label: "Domestic indices",
    sub: "India (NSE / BSE)",
    empty: "Domestic indices will appear after the next data refresh.",
  },
  {
    cat: "international",
    label: "Global indices",
    empty: "Global indices will appear after the next data refresh.",
  },
  {
    cat: "currency",
    label: "Currency",
    empty: "Currency rates will appear after the next data refresh.",
  },
  {
    cat: "depository",
    label: "Depository Receipts",
    sub: "Indian ADRs / GDRs",
    empty: "Indian depository receipts will appear after the next data refresh.",
  },
];

// Domestic = India. Used only as a fallback when the data doesn't carry a
// `category` yet (older bundles). Once the exporter tags each quote, that wins.
const DOMESTIC_KEYS = new Set(["NIFTY", "BANKNIFTY", "SENSEX", "INDIAVIX"]);

function categoryOf(q: IndexQuote): Cat {
  if (
    q.category === "domestic" ||
    q.category === "international" ||
    q.category === "currency" ||
    q.category === "depository"
  )
    return q.category;
  if (q.key === "USDINR" || /\b\w{3}\/\w{3}\b/.test(q.label)) return "currency";
  if (DOMESTIC_KEYS.has(q.key) || /\b(nifty|sensex|india|bse)\b/i.test(q.label)) return "domestic";
  return "international";
}

export default function GlobalIndices() {
  const [data, setData] = useState<IndicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Cat>("domestic");
  const [fx, setFx] = useState<FxRates | null>(null);

  // Live currency rates (free, no-key API) so the Currency tab actually updates
  // rather than showing the once-a-day bundle snapshot. Refreshes every 30 min.
  useEffect(() => {
    let alive = true;
    getFxRates().then((r) => alive && setFx(r));
    const id = setInterval(() => getFxRates(true).then((r) => alive && setFx(r)), 30 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Currency rows computed live from the FX rates (USD-based cross rates).
  const fxRows = useMemo<IndexQuote[]>(() => {
    if (!fx) return [];
    return FX_PAIRS.map(([from, to]) => ({
      key: `${from}${to}`,
      label: `${from}/${to}`,
      value: convert(fx, 1, from, to),
      change_pct: null,
      category: "currency" as const,
      country: null,
      data_date: null,
    })).filter((q) => q.value != null);
  }, [fx]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .indices()
        .then((d) => alive && setData(d))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    const id = setInterval(load, 60_000); // refresh levels periodically
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const groups = useMemo(() => {
    const g: Record<Cat, IndexQuote[]> = {
      domestic: [],
      international: [],
      currency: [],
      depository: [],
    };
    for (const q of data?.indices ?? []) g[categoryOf(q)].push(q);
    return g;
  }, [data]);

  // Per-tab "last updated": the newest market date among that tab's quotes
  // (markets close at different times), falling back to the bundle's stamp.
  const lastUpdated = (items: IndexQuote[]): string => {
    const dates = items.map((q) => q.data_date).filter((d): d is string => !!d);
    if (dates.length) return `Last updated ${dates.sort().at(-1)}`;
    if (data?.data_date) return `Last updated ${data.data_date}`;
    const s = fmtStamp(data?.generated_at ?? data?.as_of);
    return s ? `Updated ${s}` : "";
  };

  const active = TABS.find((t) => t.cat === tab)!;
  // The Currency tab prefers live FX rows; everything else uses the bundle.
  const items = tab === "currency" && fxRows.length ? fxRows : groups[tab];
  // Currency + Depository Receipts are a small fixed set — show them as a compact
  // list instead of cards. Indices stay as cards. All open a TradingView chart.
  const asList = tab === "currency" || tab === "depository";

  return (
    <section className="gidx">
      <header className="gidx-head">
        <h1>Indices, Forex &amp; DRs</h1>
      </header>

      <div className="gidx-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.cat}
            type="button"
            role="tab"
            aria-selected={tab === t.cat}
            className={`gidx-tab${tab === t.cat ? " on" : ""}`}
            onClick={() => setTab(t.cat)}
          >
            {t.label}
            <span className="gidx-tab-count">
              {t.cat === "currency" && fxRows.length ? fxRows.length : groups[t.cat].length}
            </span>
          </button>
        ))}
      </div>

      <div className="gidx-panel" role="tabpanel">
        <div className="gidx-panel-head">
          {active.sub && <span className="gidx-panel-sub">{active.sub}</span>}
          <span className="gidx-asof">
            {tab === "currency" && fx
              ? `Live rates${fx.updated ? ` · ${fx.updated}` : ""}`
              : lastUpdated(items)}
          </span>
        </div>

        {loading && !data ? (
          <p className="gidx-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="gidx-empty">{active.empty}</p>
        ) : asList ? (
          <div className="gidx-list">
            {items.map((q) => {
              const url = tradingViewUrl(q);
              return (
                <a
                  className="gidx-row"
                  key={q.key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${q.label} on TradingView`}
                  onClick={(e) => { e.preventDefault(); void openExternal(url); }}
                >
                  <span className="gidx-row-name">
                    <span className="gidx-label">{q.label}</span>
                    {q.country && <span className="gidx-country">{q.country}</span>}
                  </span>
                  <span className="gidx-row-value">{q.value != null ? fmtNum(q.value) : "—"}</span>
                  {q.change_pct != null && (
                    <span className={`gidx-chg ${signClass(q.change_pct)}`}>{fmtPct(q.change_pct)}</span>
                  )}
                  {q.data_date && <span className="gidx-row-date">EOD {q.data_date}</span>}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="gidx-grid">
            {items.map((q) => {
              const url = tradingViewUrl(q);
              return (
                <a
                  className="gidx-card"
                  key={q.key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${q.label} on TradingView`}
                  onClick={(e) => { e.preventDefault(); void openExternal(url); }}
                >
                  <div className="gidx-card-top">
                    <span className="gidx-label">{q.label}</span>
                    {q.country && <span className="gidx-country">{q.country}</span>}
                  </div>
                  <span className="gidx-value">{q.value != null ? fmtNum(q.value) : "—"}</span>
                  {q.change_pct != null && (
                    <span className={`gidx-chg ${signClass(q.change_pct)}`}>
                      {fmtPct(q.change_pct)}
                    </span>
                  )}
                  {q.data_date && <span className="gidx-date">EOD {q.data_date}</span>}
                </a>
              );
            })}
          </div>
        )}
      </div>

      <p className="gidx-disclaimer">
        Factual end-of-day / delayed index, currency and depository-receipt levels for
        information only — not investment advice. Figures may be delayed or contain errors;
        verify with the respective exchange.
      </p>
    </section>
  );
}
