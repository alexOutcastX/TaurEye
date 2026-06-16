import { useMemo, useState } from "react";
import { fmtNum } from "../lib/format";
import "./Calculators.css";

// Indian rupee, Indian digit grouping, no decimals for large money.
const inr = (n: number, dp = 0) =>
  Number.isFinite(n) ? `₹${fmtNum(Math.round(n * 10 ** dp) / 10 ** dp, dp)}` : "—";
const pct = (n: number, dp = 2) => (Number.isFinite(n) ? `${n.toFixed(dp)}%` : "—");
const num = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
};

type CalcKey =
  | "sip"
  | "lumpsum"
  | "cagr"
  | "goal"
  | "position"
  | "rr"
  | "brokerage";

const CALCS: { key: CalcKey; label: string; group: "Investing" | "Trading" }[] = [
  { key: "sip", label: "SIP", group: "Investing" },
  { key: "lumpsum", label: "Lumpsum", group: "Investing" },
  { key: "cagr", label: "CAGR / returns", group: "Investing" },
  { key: "goal", label: "Goal planner", group: "Investing" },
  { key: "position", label: "Position size", group: "Trading" },
  { key: "rr", label: "Risk : reward", group: "Trading" },
  { key: "brokerage", label: "Brokerage & charges", group: "Trading" },
];

export default function Calculators() {
  const [active, setActive] = useState<CalcKey>("sip");
  return (
    <section className="calc">
      <header className="calc-head">
        <h1>Calculators</h1>
        <p className="calc-sub">Plan investments and size trades. Estimates only — not investment advice.</p>
      </header>

      <nav className="calc-tabs">
        {CALCS.map((c) => (
          <button
            key={c.key}
            className={`calc-tab ${active === c.key ? "active" : ""}`}
            onClick={() => setActive(c.key)}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <div className="calc-body">
        {active === "sip" && <Sip />}
        {active === "lumpsum" && <Lumpsum />}
        {active === "cagr" && <Cagr />}
        {active === "goal" && <Goal />}
        {active === "position" && <Position />}
        {active === "rr" && <RiskReward />}
        {active === "brokerage" && <Brokerage />}
      </div>

      <p className="calc-disclaimer">
        These calculators are <strong>informational tools</strong>, not investment advice. Returns are illustrative
        (compounding assumptions), not guaranteed; markets carry risk. Brokerage/charges are approximate and vary by
        broker and current statutory rates — verify with your broker’s contract note.
      </p>
    </section>
  );
}

// ---------------- shared field + result ----------------
function Field({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="calc-field">
      <span className="calc-field-l">{label}</span>
      <span className="calc-input">
        <input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="calc-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="calc-seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? "active" : ""} onClick={() => onChange(v)} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}

function Result({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: string }) {
  return (
    <div className={`calc-res ${big ? "big" : ""}`}>
      <span className="calc-res-l">{label}</span>
      <span className={`calc-res-v ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function Layout({ inputs, results }: { inputs: React.ReactNode; results: React.ReactNode }) {
  return (
    <div className="calc-card">
      <div className="calc-grid">
        <div className="calc-inputs">{inputs}</div>
        <div className="calc-results">{results}</div>
      </div>
    </div>
  );
}

// ---------------- SIP ----------------
function Sip() {
  const [amt, setAmt] = useState("10000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");
  const r = useMemo(() => {
    const P = num(amt);
    const i = num(rate) / 100 / 12;
    const n = num(years) * 12;
    const fv = i > 0 ? P * ((Math.pow(1 + i, n) - 1) / i) * (1 + i) : P * n;
    const invested = P * n;
    return { fv, invested, gains: fv - invested };
  }, [amt, rate, years]);
  return (
    <Layout
      inputs={
        <>
          <Field label="Monthly investment" value={amt} onChange={setAmt} suffix="₹" />
          <Field label="Expected return (p.a.)" value={rate} onChange={setRate} suffix="%" step="0.1" />
          <Field label="Period" value={years} onChange={setYears} suffix="yrs" />
        </>
      }
      results={
        <>
          <Result label="Future value" value={inr(r.fv)} big tone="up" />
          <Result label="Invested" value={inr(r.invested)} />
          <Result label="Estimated gains" value={inr(r.gains)} tone="up" />
        </>
      }
    />
  );
}

// ---------------- Lumpsum ----------------
function Lumpsum() {
  const [amt, setAmt] = useState("100000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");
  const r = useMemo(() => {
    const P = num(amt);
    const fv = P * Math.pow(1 + num(rate) / 100, num(years));
    return { fv, invested: P, gains: fv - P };
  }, [amt, rate, years]);
  return (
    <Layout
      inputs={
        <>
          <Field label="Investment amount" value={amt} onChange={setAmt} suffix="₹" />
          <Field label="Expected return (p.a.)" value={rate} onChange={setRate} suffix="%" step="0.1" />
          <Field label="Period" value={years} onChange={setYears} suffix="yrs" />
        </>
      }
      results={
        <>
          <Result label="Future value" value={inr(r.fv)} big tone="up" />
          <Result label="Invested" value={inr(r.invested)} />
          <Result label="Estimated gains" value={inr(r.gains)} tone="up" />
        </>
      }
    />
  );
}

// ---------------- CAGR ----------------
function Cagr() {
  const [init, setInit] = useState("100000");
  const [final, setFinal] = useState("250000");
  const [years, setYears] = useState("5");
  const r = useMemo(() => {
    const i = num(init);
    const f = num(final);
    const y = num(years);
    const cagr = i > 0 && y > 0 ? (Math.pow(f / i, 1 / y) - 1) * 100 : NaN;
    const total = i > 0 ? (f / i - 1) * 100 : NaN;
    return { cagr, total, abs: f - i };
  }, [init, final, years]);
  return (
    <Layout
      inputs={
        <>
          <Field label="Initial value" value={init} onChange={setInit} suffix="₹" />
          <Field label="Final value" value={final} onChange={setFinal} suffix="₹" />
          <Field label="Period" value={years} onChange={setYears} suffix="yrs" />
        </>
      }
      results={
        <>
          <Result label="CAGR (annualized)" value={pct(r.cagr)} big tone={r.cagr >= 0 ? "up" : "down"} />
          <Result label="Absolute return" value={pct(r.total)} tone={r.total >= 0 ? "up" : "down"} />
          <Result label="Gain / loss" value={inr(r.abs)} tone={r.abs >= 0 ? "up" : "down"} />
        </>
      }
    />
  );
}

// ---------------- Goal planner ----------------
function Goal() {
  const [target, setTarget] = useState("10000000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("15");
  const r = useMemo(() => {
    const F = num(target);
    const i = num(rate) / 100 / 12;
    const n = num(years) * 12;
    const sip = i > 0 ? F / (((Math.pow(1 + i, n) - 1) / i) * (1 + i)) : F / n;
    const invested = sip * n;
    return { sip, invested, gains: F - invested };
  }, [target, rate, years]);
  return (
    <Layout
      inputs={
        <>
          <Field label="Target corpus" value={target} onChange={setTarget} suffix="₹" />
          <Field label="Expected return (p.a.)" value={rate} onChange={setRate} suffix="%" step="0.1" />
          <Field label="Time to goal" value={years} onChange={setYears} suffix="yrs" />
        </>
      }
      results={
        <>
          <Result label="Required monthly SIP" value={inr(r.sip)} big tone="up" />
          <Result label="Total invested" value={inr(r.invested)} />
          <Result label="Growth needed" value={inr(r.gains)} />
        </>
      }
    />
  );
}

// ---------------- Position size (risk-based) ----------------
function Position() {
  const [capital, setCapital] = useState("500000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("1000");
  const [stop, setStop] = useState("950");
  const r = useMemo(() => {
    const cap = num(capital);
    const riskAmt = (cap * num(riskPct)) / 100;
    const perShare = Math.abs(num(entry) - num(stop));
    const qty = perShare > 0 ? Math.floor(riskAmt / perShare) : 0;
    const cost = qty * num(entry);
    return { riskAmt, perShare, qty, cost, capUsed: cap > 0 ? (cost / cap) * 100 : 0 };
  }, [capital, riskPct, entry, stop]);
  return (
    <Layout
      inputs={
        <>
          <Field label="Trading capital" value={capital} onChange={setCapital} suffix="₹" />
          <Field label="Risk per trade" value={riskPct} onChange={setRiskPct} suffix="%" step="0.1" />
          <Field label="Entry price" value={entry} onChange={setEntry} suffix="₹" step="0.05" />
          <Field label="Stop-loss price" value={stop} onChange={setStop} suffix="₹" step="0.05" />
        </>
      }
      results={
        <>
          <Result label="Shares to buy" value={fmtNum(r.qty, 0)} big />
          <Result label="Capital at risk" value={inr(r.riskAmt)} tone="down" />
          <Result label="Risk per share" value={inr(r.perShare, 2)} />
          <Result label="Position cost" value={`${inr(r.cost)} (${r.capUsed.toFixed(0)}% of capital)`} />
        </>
      }
    />
  );
}

// ---------------- Risk : reward ----------------
function RiskReward() {
  const [entry, setEntry] = useState("1000");
  const [stop, setStop] = useState("950");
  const [target, setTarget] = useState("1150");
  const [qty, setQty] = useState("100");
  const r = useMemo(() => {
    const e = num(entry);
    const s = num(stop);
    const t = num(target);
    const q = num(qty);
    const risk = Math.abs(e - s);
    const reward = Math.abs(t - e);
    return {
      ratio: risk > 0 ? reward / risk : NaN,
      lossPct: e > 0 ? ((s - e) / e) * 100 : 0,
      gainPct: e > 0 ? ((t - e) / e) * 100 : 0,
      lossAmt: risk * q,
      rewardAmt: reward * q,
    };
  }, [entry, stop, target, qty]);
  return (
    <Layout
      inputs={
        <>
          <Field label="Entry price" value={entry} onChange={setEntry} suffix="₹" step="0.05" />
          <Field label="Stop-loss" value={stop} onChange={setStop} suffix="₹" step="0.05" />
          <Field label="Target" value={target} onChange={setTarget} suffix="₹" step="0.05" />
          <Field label="Quantity" value={qty} onChange={setQty} />
        </>
      }
      results={
        <>
          <Result label="Risk : reward" value={Number.isFinite(r.ratio) ? `1 : ${r.ratio.toFixed(2)}` : "—"} big />
          <Result label="Potential profit" value={`${inr(r.rewardAmt)} (${pct(r.gainPct)})`} tone="up" />
          <Result label="Potential loss" value={`${inr(r.lossAmt)} (${pct(r.lossPct)})`} tone="down" />
        </>
      }
    />
  );
}

// ---------------- Brokerage & charges (Indian, discount-broker defaults) ----------------
// Approximate statutory rates; brokerage editable. Verify against your broker.
const RATES = {
  exchTxn: 0.0000297, // NSE equity ~0.00297% of turnover
  sebi: 0.000001, // ₹10 per crore
  gst: 0.18, // on (brokerage + exch txn + sebi)
  dpPerScrip: 13.5, // depository + broker DP charge on delivery sell
  delivery: { brokerage: 0, sttBuy: 0.001, sttSell: 0.001, stampBuy: 0.00015 },
  intraday: { brokeragePct: 0.0003, brokerageCap: 20, sttSell: 0.00025, stampBuy: 0.00003 },
};

function Brokerage() {
  const [seg, setSeg] = useState("delivery");
  const [buy, setBuy] = useState("1000");
  const [sell, setSell] = useState("1050");
  const [qty, setQty] = useState("100");
  const r = useMemo(() => {
    const b = num(buy);
    const s = num(sell);
    const q = num(qty);
    const buyTurnover = b * q;
    const sellTurnover = s * q;
    const turnover = buyTurnover + sellTurnover;
    let brokerage: number;
    let stt: number;
    let stamp: number;
    let dp = 0;
    if (seg === "delivery") {
      brokerage = 0; // most discount brokers: ₹0 delivery
      stt = (buyTurnover + sellTurnover) * RATES.delivery.sttBuy; // 0.1% both sides
      stamp = buyTurnover * RATES.delivery.stampBuy;
      dp = RATES.dpPerScrip;
    } else {
      const perSide = (t: number) => Math.min(t * RATES.intraday.brokeragePct, RATES.intraday.brokerageCap);
      brokerage = perSide(buyTurnover) + perSide(sellTurnover);
      stt = sellTurnover * RATES.intraday.sttSell; // sell side only
      stamp = buyTurnover * RATES.intraday.stampBuy;
    }
    const exch = turnover * RATES.exchTxn;
    const sebi = turnover * RATES.sebi;
    const gst = (brokerage + exch + sebi) * RATES.gst;
    const charges = brokerage + stt + exch + sebi + gst + stamp + dp;
    const gross = (s - b) * q;
    const net = gross - charges;
    const breakeven = q > 0 ? charges / q : 0; // ₹/share move to break even
    return { turnover, brokerage, stt, exch, sebi, gst, stamp, dp, charges, gross, net, breakeven };
  }, [seg, buy, sell, qty]);
  return (
    <Layout
      inputs={
        <>
          <div className="calc-field">
            <span className="calc-field-l">Segment</span>
            <Seg
              options={[
                ["delivery", "Delivery"],
                ["intraday", "Intraday"],
              ]}
              value={seg}
              onChange={setSeg}
            />
          </div>
          <Field label="Buy price" value={buy} onChange={setBuy} suffix="₹" step="0.05" />
          <Field label="Sell price" value={sell} onChange={setSell} suffix="₹" step="0.05" />
          <Field label="Quantity" value={qty} onChange={setQty} />
        </>
      }
      results={
        <>
          <Result label="Net P&L (after charges)" value={inr(r.net)} big tone={r.net >= 0 ? "up" : "down"} />
          <Result label="Gross P&L" value={inr(r.gross)} tone={r.gross >= 0 ? "up" : "down"} />
          <Result label="Total charges" value={inr(r.charges, 2)} tone="down" />
          <div className="calc-breakdown">
            <span>Brokerage {inr(r.brokerage, 2)}</span>
            <span>STT {inr(r.stt, 2)}</span>
            <span>Exchange {inr(r.exch, 2)}</span>
            <span>GST {inr(r.gst, 2)}</span>
            <span>Stamp {inr(r.stamp, 2)}</span>
            <span>SEBI {inr(r.sebi, 2)}</span>
            {r.dp > 0 && <span>DP {inr(r.dp, 2)}</span>}
          </div>
          <Result label="Break-even move" value={`${inr(r.breakeven, 2)}/share`} />
        </>
      }
    />
  );
}
