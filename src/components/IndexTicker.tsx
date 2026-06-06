import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { IndicesResponse } from "../api/types";
import { fmtNum, fmtPct, fmtStamp, signClass } from "../lib/format";
import "./IndexTicker.css";

// Small, readable freshness line: the EOD date the prices belong to, plus when
// the data was last updated (publish time for offline; last fetch otherwise).
function freshness(data: IndicesResponse): string {
  const updated = fmtStamp(data.generated_at ?? data.as_of);
  return [
    data.data_date ? `Prices as of ${data.data_date} (EOD)` : null,
    updated ? `updated ${updated}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Slim market-index strip under the top bar: NIFTY, BANK NIFTY, SENSEX,
 * INDIA VIX, USD/INR with live levels + % change, plus the "prices as of" EOD
 * date. Polls every 60s. Factual data only — no advice.
 */
export default function IndexTicker() {
  const [data, setData] = useState<IndicesResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.indices().then((d) => alive && setData(d)).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!data || data.indices.length === 0) {
    // Nothing to show (sources unreachable) — render only the freshness line.
    const text = data ? freshness(data) : "";
    return text ? (
      <div className="idx-strip">
        <span className="idx-asof">{text}</span>
      </div>
    ) : null;
  }

  return (
    <div className="idx-strip">
      <div className="idx-items">
        {data.indices.map((q) => (
          <span className="idx-item" key={q.key}>
            <span className="idx-label">{q.label}</span>
            <span className="idx-value">
              {q.value != null ? fmtNum(q.value) : "—"}
            </span>
            {q.change_pct != null && (
              <span className={`idx-chg ${signClass(q.change_pct)}`}>
                {fmtPct(q.change_pct)}
              </span>
            )}
          </span>
        ))}
      </div>
      {freshness(data) && (
        <span className="idx-asof" title={`Indices as of ${new Date(data.as_of).toLocaleString("en-IN")}`}>
          {freshness(data)}
        </span>
      )}
    </div>
  );
}
