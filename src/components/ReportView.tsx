import { useEffect, useState } from "react";
import type { Metrics } from "../api/types";
import { fmtCap, fmtInt, fmtNum, fmtPct, signClass } from "../lib/format";
import { localCapSegment, localDataInfo, localSecurityInfo } from "../data/snapshot";
import { dataUrl } from "../data/source";
import Markdown from "./Markdown";
import "./ReportView.css";

export interface ReportData {
  aiText: string | null;
  aiDisclaimer?: string | null;
  corpActions?: CorpAction[] | null;
}

interface CorpAction {
  ex_date: string;
  kind: string;
  ratio: number;
  detail?: string | null;
}

// Shape of the published funda/<SYMBOL>.json (sections fill in as the data
// pipeline ingests them; absent sections render an honest "not yet" note).
interface FundaFile {
  about?: string | null;
  corporate_actions?: CorpAction[];
  financials?: {
    period_end: string;
    period_type: string;
    revenue: number | null;
    net_profit: number | null;
    eps: number | null;
  }[];
  balance_sheets?: {
    period_end: string;
    period_type: string;
    total_debt: number | null;
    long_term_debt: number | null;
    short_term_debt: number | null;
    cash: number | null;
    net_debt: number | null;
    equity: number | null;
  }[];
  announcements?: { dt: string; category?: string | null; headline: string }[];
}

/**
 * In-app stock report — full-screen overlay (no popup windows). "Download PDF"
 * uses the browser's print dialog with a print stylesheet that isolates the
 * report. Self-loads the data-as-of stamp, face value, and the per-symbol
 * fundamentals file (balance sheet / borrowings / filings when published).
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

  const [asOf, setAsOf] = useState<string | null>(null);
  const [faceValue, setFaceValue] = useState<number | null>(null);
  const [shares, setShares] = useState<number | null>(null);
  const [capSeg, setCapSeg] = useState<string | null>(null);
  const [funda, setFunda] = useState<FundaFile | null>(null);

  useEffect(() => {
    let active = true;
    localDataInfo().then((i) => active && setAsOf(i.generated_at));
    localSecurityInfo(m.symbol).then((s) => {
      if (!active) return;
      setFaceValue(s?.face_value ?? null);
      setShares(s?.shares_outstanding ?? null);
    });
    localCapSegment(m.symbol).then((c) => active && setCapSeg(c?.segment ?? null));
    fetch(dataUrl(`funda/${encodeURIComponent(m.symbol)}.json`))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => active && setFunda(j))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [m.symbol]);

  const corpActions = data.corpActions ?? funda?.corporate_actions ?? null;
  const sheets = funda?.balance_sheets ?? null;
  const filings = funda?.announcements ?? null;
  const latestSheet = sheets?.[0] ?? null;
  const dToE =
    latestSheet?.total_debt != null && latestSheet?.equity ? latestSheet.total_debt / latestSheet.equity : null;

  // Valuation ratios — computed only when the fundamentals feed supplies the
  // inputs (never estimated). P/E uses trailing-12-month EPS (last 4 quarters);
  // P/B uses latest equity / shares outstanding; dividend yield needs dividend
  // history (not in the data yet) so it stays "—" until then.
  const ttmEps = (() => {
    const qs = (funda?.financials ?? []).filter((f) => f.period_type === "Q" && f.eps != null).slice(0, 4);
    if (qs.length < 4) return null;
    return qs.reduce((s, f) => s + (f.eps as number), 0);
  })();
  const pe = ttmEps != null && ttmEps > 0 ? m.close / ttmEps : null;
  const bvps = latestSheet?.equity != null && shares ? latestSheet.equity / shares : null;
  const pb = bvps != null && bvps > 0 ? m.close / bvps : null;

  const asOfLabel = asOf
    ? new Date(asOf).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="rpt-overlay" role="dialog" aria-label="Stock report">
      <div className="rpt-bar noprint">
        <span className="rpt-bar-title">📄 {m.symbol} — Report</span>
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
            <h1>
              {m.symbol}
              {capSeg && <span className="rpt-capseg">{capSeg}</span>}
            </h1>
            <div className="rpt-sub">
              {m.name} · {m.exchange}
              {m.sector && m.sector !== "Unknown" ? ` · ${m.sector}` : ""}
            </div>
          </div>
          <span className="rpt-brand">TaurEye</span>
        </div>

        <div className="rpt-price">
          ₹{fmtNum(m.close)}{" "}
          <span className={`rpt-chg ${up}`}>{fmtPct(m.change_pct)} today</span>
        </div>
        <div className="rpt-asof">
          End-of-day price{asOfLabel ? ` · data as of ${asOfLabel}` : ""}
        </div>

        <div className="rpt-grid">
          <Stat label="Market cap" value={fmtCap(m.market_cap_cr)} />
          <Stat label="Face value" value={faceValue != null ? `₹${fmtNum(faceValue, faceValue % 1 === 0 ? 0 : 2)}` : "—"} />
          <Stat label="P/E (TTM)" value={pe != null ? fmtNum(pe, 1) : "—"} />
          <Stat label="P/B" value={pb != null ? fmtNum(pb, 1) : "—"} />
          <Stat label="Div yield" value="—" />
          <Stat label="RSI (14)" value={fmtNum(m.rsi_14, 1)} />
          <Stat label="vs 50 DMA" value={fmtPct(m.pct_above_sma50)} cls={signClass(m.pct_above_sma50)} />
          <Stat label="vs 200 DMA" value={fmtPct(m.pct_above_sma200)} cls={signClass(m.pct_above_sma200)} />
          <Stat label="From 52w high" value={fmtPct(m.dist_52w_high_pct)} />
          <Stat label="ATR %" value={fmtPct(m.atr_pct)} />
          <Stat label="Volume" value={fmtInt(m.volume)} />
          <Stat label="Rel volume" value={`${fmtNum(m.rel_volume)}x`} />
        </div>

        <h2 className="rpt-sec">About the Company</h2>
        {funda?.about ? (
          <p className="rpt-about">{funda.about}</p>
        ) : (
          <p className="rpt-na">
            Company profile isn't available for this stock yet — it will appear
            here once the fundamentals data feed is connected.
          </p>
        )}

        {data.aiText && (
          <>
            <h2 className="rpt-sec">AI Commentary</h2>
            <Markdown text={data.aiText} className="rpt-ai" />
          </>
        )}

        <h2 className="rpt-sec">Balance Sheet &amp; Borrowings</h2>
        {sheets && sheets.length > 0 ? (
          <>
            <table className="rpt-ca">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Total debt</th>
                  <th>Long-term</th>
                  <th>Short-term</th>
                  <th>Cash</th>
                  <th>Net debt</th>
                  <th>Equity</th>
                </tr>
              </thead>
              <tbody>
                {sheets.slice(0, 4).map((b, i) => (
                  <tr key={i}>
                    <td>{b.period_end} ({b.period_type})</td>
                    <td>{fmtNum(b.total_debt ?? null, 0)}</td>
                    <td>{fmtNum(b.long_term_debt ?? null, 0)}</td>
                    <td>{fmtNum(b.short_term_debt ?? null, 0)}</td>
                    <td>{fmtNum(b.cash ?? null, 0)}</td>
                    <td>{fmtNum(b.net_debt ?? null, 0)}</td>
                    <td>{fmtNum(b.equity ?? null, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dToE != null && (
              <p className="rpt-kv">
                <strong>Debt-to-equity (latest):</strong> {fmtNum(dToE)}
              </p>
            )}
          </>
        ) : (
          <p className="rpt-na">
            Balance sheet and borrowings data isn't available for this stock yet —
            it will appear here once the fundamentals data feed is connected.
          </p>
        )}

        <h2 className="rpt-sec">Recent Filings &amp; Capex / Order Announcements</h2>
        {filings && filings.length > 0 ? (
          <ul className="rpt-filings">
            {filings.slice(0, 6).map((a, i) => (
              <li key={i}>
                <span className="rpt-fil-dt">{a.dt.slice(0, 10)}</span>
                {a.category ? <span className="rpt-fil-cat">{a.category}</span> : null}
                <span>{a.headline}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rpt-na">
            Corporate filings (capex plans, order wins, board meetings) aren't
            available for this stock yet — they will appear here once the
            fundamentals data feed is connected.
          </p>
        )}

        {corpActions && corpActions.length > 0 && (
          <>
            <h2 className="rpt-sec">Corporate Actions</h2>
            <table className="rpt-ca">
              <tbody>
                {corpActions.slice(0, 12).map((a, i) => (
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
          <span>
            Generated {generated}
            {asOfLabel ? ` · data as of ${asOfLabel}` : " · end-of-day data"}
          </span>
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
