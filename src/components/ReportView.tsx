import type { Metrics } from "../api/types";
import { fmtCap, fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import Markdown from "./Markdown";
import "./ReportView.css";

export interface ReportData {
  aiText: string | null;
  aiDisclaimer?: string | null;
  corpActions?: { ex_date: string; kind: string; ratio: number; detail?: string | null }[] | null;
}

/**
 * In-app stock report — full-screen overlay (no popup windows). "Download PDF"
 * uses the browser's print dialog with a print stylesheet that isolates the
 * report, so users can Save as PDF without pop-up permissions.
 */
export default function ReportView({
  m,
  data,
  onClose,
}: {
  m: Metrics;
  data: ReportData;
  onClose: () => void;
}) {
  const up = m.change_pct > 0 ? "up" : m.change_pct < 0 ? "down" : "";
  const generated = new Date().toLocaleString("en-IN");

  return (
    <div className="rpt-overlay" role="dialog" aria-label="Stock report">
      <div className="rpt-bar noprint">
        <span className="rpt-bar-title">📄 {m.symbol} — AI Report</span>
        <div className="rpt-bar-actions">
          <button className="rpt-btn" onClick={() => window.print()}>
            Download PDF
          </button>
          <button className="rpt-btn ghost" onClick={onClose}>
            Close ✕
          </button>
        </div>
      </div>

      <div className="rpt-page" id="report-print-root">
        <div className="rpt-head">
          <div>
            <h1>{m.symbol}</h1>
            <div className="rpt-sub">
              {m.name} · {m.exchange}
              {m.sector ? ` · ${m.sector}` : ""}
            </div>
          </div>
          <span className="rpt-brand">TaurEye</span>
        </div>

        <div className="rpt-price">
          ₹{fmtNum(m.close)}{" "}
          <span className={`rpt-chg ${up}`}>
            {fmtPct(m.change_pct)} today
          </span>
        </div>

        <div className="rpt-grid">
          <Stat label="Market cap" value={fmtCap(m.market_cap_cr)} />
          <Stat label="RSI (14)" value={fmtNum(m.rsi_14, 1)} />
          <Stat label="vs 50 DMA" value={fmtPct(m.pct_above_sma50)} cls={signClass(m.pct_above_sma50)} />
          <Stat label="vs 200 DMA" value={fmtPct(m.pct_above_sma200)} cls={signClass(m.pct_above_sma200)} />
          <Stat label="From 52w high" value={fmtPct(m.dist_52w_high_pct)} />
          <Stat label="ATR %" value={fmtPct(m.atr_pct)} />
          <Stat label="Volume" value={fmtInt(m.volume)} />
          <Stat label="Rel volume" value={`${fmtNum(m.rel_volume)}x`} />
        </div>

        {data.aiText && (
          <>
            <h2 className="rpt-sec">AI Commentary</h2>
            <Markdown text={data.aiText} className="rpt-ai" />
          </>
        )}

        {data.corpActions && data.corpActions.length > 0 && (
          <>
            <h2 className="rpt-sec">Corporate Actions</h2>
            <table className="rpt-ca">
              <tbody>
                {data.corpActions.slice(0, 12).map((a, i) => (
                  <tr key={i}>
                    <td>{a.ex_date}</td>
                    <td>{a.kind}</td>
                    <td>{a.detail || a.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className="rpt-disc">
          {data.aiDisclaimer ||
            "This report is informational and educational only and is not investment advice."}
        </p>
        <div className="rpt-foot">
          <span>Generated {generated} · End-of-day data</span>
          <span>TaurEye · for research, not investment advice</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rpt-stat">
      <span className="rpt-stat-l">{label}</span>
      <span className={`rpt-stat-v ${cls ?? ""}`}>{value}</span>
    </div>
  );
}
