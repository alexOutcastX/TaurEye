// Generate a printable one-page scrip report from the metrics already loaded in
// the screener row. Opens a standalone window with self-contained inline styles
// and triggers the print dialog, so the user can "Save as PDF" or print directly.
// No backend round-trip and no file is written to disk by the app itself.

import type { Metrics } from "../api/types";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const num = (n: number | null | undefined, dp = 2) =>
  n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

function cap(cr: number | null | undefined): string {
  if (cr == null) return "—";
  if (cr >= 100000) return `₹${(cr / 100000).toFixed(2)}L cr`;
  if (cr >= 1000) return `₹${(cr / 1000).toFixed(2)}k cr`;
  return `₹${cr.toFixed(0)} cr`;
}

function row(label: string, value: string, cls = ""): string {
  return `<tr><td class="lbl">${esc(label)}</td><td class="val ${cls}">${esc(value)}</td></tr>`;
}

function reportHtml(m: Metrics): string {
  const up = m.change_pct > 0 ? "up" : m.change_pct < 0 ? "down" : "";
  const generated = new Date().toLocaleString("en-IN");
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(m.symbol)} — TaurEye report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         color: #14181f; margin: 0; padding: 36px 44px; background: #fff; }
  .hd { display: flex; justify-content: space-between; align-items: baseline;
        border-bottom: 2px solid #14181f; padding-bottom: 14px; }
  .hd h1 { font-size: 26px; margin: 0; letter-spacing: -0.01em; }
  .hd .sub { color: #5b6472; font-size: 13px; margin-top: 4px; }
  .hd .brand { font-size: 13px; color: #11a36b; font-weight: 700; letter-spacing: 0.04em; }
  .price { margin: 20px 0 8px; font-size: 30px; font-weight: 700; }
  .chg { font-size: 15px; font-weight: 600; }
  .up { color: #11a36b; } .down { color: #e23d5a; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
       color: #5b6472; margin: 26px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 7px 4px; border-bottom: 1px solid #eef0f3; }
  td.lbl { color: #5b6472; } td.val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .cols { display: flex; gap: 40px; } .cols > div { flex: 1; }
  .ft { margin-top: 30px; padding-top: 12px; border-top: 1px solid #eef0f3;
        font-size: 11px; color: #97a0ad; display: flex; justify-content: space-between; }
  @media print { body { padding: 16px 20px; } .noprint { display: none; } }
  .noprint { margin-top: 24px; }
  .btn { background: #11a36b; color: #fff; border: 0; border-radius: 6px;
         padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
</style></head>
<body>
  <div class="hd">
    <div>
      <h1>${esc(m.symbol)}</h1>
      <div class="sub">${esc(m.name)} · ${esc(m.exchange)}${m.sector ? " · " + esc(m.sector) : ""}</div>
    </div>
    <div class="brand">TaurEye</div>
  </div>

  <div class="price">₹${num(m.close)}</div>
  <div class="chg ${up}">${pct(m.change_pct)} (${m.change_abs >= 0 ? "+" : ""}${num(m.change_abs)}) today</div>

  <div class="cols">
    <div>
      <h2>Trend &amp; Momentum</h2>
      <table>
        ${row("RSI (14)", num(m.rsi_14, 1))}
        ${row("MACD histogram", num(m.macd_hist, 3))}
        ${row("vs 20 DMA", pct(m.pct_above_sma20), m.pct_above_sma20 > 0 ? "up" : "down")}
        ${row("vs 50 DMA", pct(m.pct_above_sma50), m.pct_above_sma50 > 0 ? "up" : "down")}
        ${row("vs 200 DMA", pct(m.pct_above_sma200), m.pct_above_sma200 > 0 ? "up" : "down")}
        ${row("ATR %", num(m.atr_pct))}
      </table>
    </div>
    <div>
      <h2>Levels &amp; Liquidity</h2>
      <table>
        ${row("SMA 20 / 50 / 200", `${num(m.sma_20)} / ${num(m.sma_50)} / ${num(m.sma_200)}`)}
        ${row("Dist. from 52w high", pct(m.dist_52w_high_pct), "down")}
        ${row("Dist. from 52w low", pct(m.dist_52w_low_pct), "up")}
        ${row("Volume", m.volume.toLocaleString("en-IN"))}
        ${row("Relative volume", `${num(m.rel_volume)}x`)}
        ${row("Market cap", cap(m.market_cap_cr))}
      </table>
    </div>
  </div>

  <div class="ft">
    <span>Generated ${esc(generated)} · End-of-day data</span>
    <span>TaurEye · for research, not investment advice</span>
  </div>

  <div class="noprint">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
</body></html>`;
}

export function generateReport(m: Metrics): void {
  const w = window.open("", "_blank", "width=860,height=960");
  if (!w) {
    window.alert("Please allow pop-ups for this site to generate the report.");
    return;
  }
  w.document.write(reportHtml(m));
  w.document.close();
  w.focus();
}
