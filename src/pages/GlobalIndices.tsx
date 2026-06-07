import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { IndexQuote, IndicesResponse } from "../api/types";
import { fmtNum, fmtPct, fmtStamp, signClass } from "../lib/format";
import "./GlobalIndices.css";

type Cat = "domestic" | "international" | "currency";

// Domestic = India. Used only as a fallback when the data doesn't carry a
// `category` yet (older bundles). Once the exporter tags each index, that wins.
const DOMESTIC_KEYS = new Set(["NIFTY", "BANKNIFTY", "SENSEX", "INDIAVIX"]);

function categoryOf(q: IndexQuote): Cat {
  if (q.category === "domestic" || q.category === "international" || q.category === "currency")
    return q.category;
  if (q.key === "USDINR" || /\b\w{3}\/\w{3}\b/.test(q.label)) return "currency";
  if (DOMESTIC_KEYS.has(q.key) || /\b(nifty|sensex|india|bse)\b/i.test(q.label)) return "domestic";
  return "international";
}

export default function GlobalIndices() {
  const [data, setData] = useState<IndicesResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
    const g: Record<Cat, IndexQuote[]> = { domestic: [], international: [], currency: [] };
    for (const q of data?.indices ?? []) g[categoryOf(q)].push(q);
    return g;
  }, [data]);

  const freshness = data
    ? [
        data.data_date ? `As of ${data.data_date}` : null,
        fmtStamp(data.generated_at ?? data.as_of) ? `updated ${fmtStamp(data.generated_at ?? data.as_of)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section className="gidx">
      <header className="gidx-head">
        <h1>Global Indices</h1>
        {freshness && <span className="gidx-asof">{freshness}</span>}
      </header>

      {loading && !data && <p className="gidx-note">Loading indices…</p>}

      <Group title="Domestic" subtitle="India" items={groups.domestic} />
      <Group
        title="International"
        items={groups.international}
        empty="International indices will appear after the next data refresh."
      />
      {groups.currency.length > 0 && <Group title="Currencies" items={groups.currency} />}

      <p className="gidx-disclaimer">
        Factual end-of-day / delayed index levels for information only — not investment
        advice. Figures may be delayed or contain errors; verify with the exchange.
      </p>
    </section>
  );
}

function Group({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle?: string;
  items: IndexQuote[];
  empty?: string;
}) {
  return (
    <div className="gidx-group">
      <h2 className="gidx-group-title">
        {title}
        {subtitle && <span className="gidx-group-sub">{subtitle}</span>}
        <span className="gidx-count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="gidx-empty">{empty ?? "No data."}</p>
      ) : (
        <div className="gidx-grid">
          {items.map((q) => (
            <div className="gidx-card" key={q.key}>
              <div className="gidx-card-top">
                <span className="gidx-label">{q.label}</span>
                {q.country && <span className="gidx-country">{q.country}</span>}
              </div>
              <span className="gidx-value">{q.value != null ? fmtNum(q.value) : "—"}</span>
              {q.change_pct != null && (
                <span className={`gidx-chg ${signClass(q.change_pct)}`}>{fmtPct(q.change_pct)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
