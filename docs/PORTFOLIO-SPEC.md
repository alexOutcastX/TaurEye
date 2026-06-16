# TaurEye — "Watchlist as Portfolio" specification

Turn watchlists into **tracked portfolios**: positions with cost basis, P&L,
exposures, risk and factor analytics, and attribution — computed client-side
from the existing static EOD bundle. Prosumer/retail tier; **informational and
non-advisory**, not a broking/demat account and not real money.

> Positioning: this is the "risk + factors" half of the institutional gap from
> the expert review (execution stays out — it requires being a SEBI broker).
> Everything here is EOD/daily frequency, which fits the static architecture.

---

## 1. Goals & non-goals

**Goals**
- Convert any watchlist into a portfolio by attaching **quantity + cost basis**.
- Show **P&L** (realized/unrealized, day & total), **returns** (simple → TWR/XIRR).
- Show **exposures** (weight by stock / sector / market-cap bucket).
- Show **risk** (volatility, beta, max drawdown, historical VaR/CVaR, concentration).
- Show **factor tilt** (value / quality / momentum / size / low-vol vs universe).
- Show **attribution** (contribution to return and to risk, by holding & sector).
- Local-first, offline-capable; optional cloud sync for signed-in users.

**Non-goals (explicit)**
- No order placement / routing / execution (not a broker).
- No real-time/intraday valuation (EOD close only).
- No tax computation/filing (we can expose realized P&L lots; not tax advice).
- No advice, no recommendations, no target prices (SEBI — informational only).

---

## 2. Data we already have (and the gaps)

| Need | Source today | Status |
|---|---|---|
| Latest price, sector, market cap, ATR%, RSI, MAs, 52w | `metrics.json` | ✅ have |
| Per-symbol daily OHLCV history (~260 bars, CA-adjusted) | `candles/<SYM>.json` | ✅ have |
| Entry price/date seed | `WatchItem.addedPrice/addedAt` | ✅ have (partial) |
| Dividends (cash/share) | parsed from NSE announcements → `dividends` table → `dividends.json` | ✅ have (cash payouts; % skipped) |
| Splits / bonus | spine `corp_actions` (prices already adjusted) | ✅ have (price-adjusted) |
| **Benchmark series (NIFTY/sector index history)** | indices.json is a snapshot only | 🔴 **gap — needs an index candle export** |
| Per-stock fundamentals (EPS → P/E; ROE) | `funda/*.json` (EPS, profit, promoter) | 🟡 P/E derivable; ROE needs equity |

**Two backend additions required for the full build (small):**
1. Export **index candle history** (`candles/_NIFTY.json`, `_BANKNIFTY.json`, …) so
   beta/correlation/relative-strength have a benchmark. ~1 extra export step.
2. Export **per-symbol dividend events** (date, amount) for true total return and a
   cash ledger. Optional for MVP (prices are split/bonus-adjusted already).

---

## 3. Data model

Keep watchlists as-is; a watchlist **becomes** a portfolio when its items carry a
position. Lot-level for correct average cost and realized P&L.

```ts
// src/lib/portfolio.ts (new)

type TxnType = "BUY" | "SELL" | "DIVIDEND" | "CASH";

interface Lot {              // an individual buy, for FIFO/avg cost & realized P&L
  id: string;
  qty: number;               // shares
  price: number;             // per-share cost (₹)
  date: string;              // ISO trade date
  fees?: number;             // brokerage+charges, optional
}

interface Position {
  symbol: string;
  exchange: string;
  lots: Lot[];               // open lots (closed ones move to realized ledger)
}

interface Txn {              // append-only audit ledger (drives realized P&L)
  id: string; ts: string;
  type: TxnType;
  symbol?: string; qty?: number; price?: number; amount?: number; note?: string;
}

interface Portfolio {
  id: string;                // mirrors a Watchlist.id (1:1) or standalone
  name: string;
  baseCurrency: "INR";
  cash?: number;             // optional cash sleeve for MWR/weights
  positions: Position[];
  ledger: Txn[];
  createdAt: string; updatedAt: string;
}
```

**Migration / UX bridge.** A `WatchItem` with `addedPrice` seeds a 1-share lot at
that price ("tracking" mode) so existing watchlists instantly show notional
returns; the user upgrades to real quantities when ready. Watchlist ⇄ Portfolio
share the same `id`, so stars/membership stay in sync.

**Storage.** Local-first in `localStorage` (`taureye.portfolios.v1`), mirrored to
a Supabase `portfolios` table (RLS, owner-only) for signed-in users — same
pattern as watchlists/saved screens. Conflict policy: last-write-wins per
portfolio with `updatedAt`.

---

## 4. Computation engine (formulas)

All from EOD closes; daily log returns `r_t = ln(P_t / P_{t-1})`.

### 4.1 Valuation & P&L
- Position avg cost = Σ(lot.qty·lot.price+fees) / Σ qty.
- Market value `MV_i = qty_i · close_i`; Portfolio `MV = Σ MV_i (+ cash)`.
- **Unrealized P&L** = MV_i − costBasis_i; **% =** MV_i/cost − 1.
- **Day P&L** = Σ qty_i · change_abs_i (from metrics).
- **Realized P&L** = from SELL txns vs matched lots (FIFO or avg — user setting).
- Weight `w_i = MV_i / MV`.

### 4.2 Returns
- **MVP:** simple return since cost basis (and "since added").
- **Full:**
  - **TWR** (time-weighted) — reconstruct a daily portfolio NAV series from
    holdings+closes, chain daily returns; removes the effect of cash flows
    (comparable to a benchmark).
  - **XIRR / MWR** (money-weighted) — IRR over the dated cash flows (buys negative,
    current MV positive); the investor's actual annualized return.

### 4.3 Risk (from aligned daily-return matrix R, last ~250 trading days)
- **Volatility** `σ_p = sqrt(wᵀ Σ w) · √252` where Σ = covariance of holdings.
- **Beta** `β_i = cov(r_i, r_m)/var(r_m)` vs NIFTY; portfolio `β_p = Σ w_i β_i`.
- **Correlation matrix** (heatmap of holdings) → diversification read.
- **Historical VaR / CVaR** — build the portfolio daily-return series `r_p,t = Σ w_i r_i,t`;
  VaR₉₅ = 5th percentile (×MV); CVaR = mean beyond it.
- **Max drawdown** — peak-to-trough of the reconstructed NAV.
- **Concentration** — top-1/5 weights and **HHI** = Σ w_i².
- **Tracking error** — std(r_p − r_m)·√252; **active beta** vs NIFTY.

### 4.4 Factor tilt (cross-sectional, from metrics + funda)
For the whole universe, z-score each factor proxy, then portfolio exposure =
Σ w_i · z_i (vs ~0 for the universe):

| Factor | Proxy available today |
|---|---|
| Momentum | 12-1m return from candles (or `dist_52w_high_pct`) |
| Low-Volatility | −`atr_pct` (and realized σ from candles) |
| Size | −ln(`market_cap_cr`) (small = positive) |
| Value | −P/E (= close / EPS from funda); fallback −P/B if available |
| Quality | ROE/ROCE (needs equity → phase 2) ; interim: low promoter pledge, +ve profit |
| Trend | `pct_above_sma200`, golden/death-cross flags |

Render as a radar/bar chart: "your book is tilted +momentum, −value, mid-cap."

### 4.5 Attribution
- **Return attribution** — contribution_i = w_i · return_i; aggregate by sector.
- **Risk attribution** — marginal contribution to risk `MCR_i = w_i·(Σw)_i / σ_p`;
  shows which names/sectors drive portfolio volatility.
- **Benchmark-relative** (phase 2) — Brinson-style allocation vs selection vs NIFTY.

---

## 5. UI / screens

Extend the existing Watchlist page with a **Portfolio toggle**, plus a dedicated
analytics view.

1. **Holdings table** — qty, avg cost, LTP, MV, weight, day P&L, total P&L (₹/%),
   inline add/edit lots. Sort/group by sector.
2. **Summary header** — total value, day P&L, total P&L, XIRR, σ, β, max DD, VaR₉₅.
3. **Allocation** — donut by sector + bar by market-cap bucket; concentration (HHI, top-5).
4. **Risk panel** — volatility, beta, VaR/CVaR, drawdown chart (reconstructed NAV
   vs NIFTY), correlation heatmap.
5. **Factor tilt** — radar/bar vs universe; one-line plain-English read.
6. **Attribution** — return & risk contribution bars by holding and by sector.
7. **Transactions** — the append-only ledger; CSV import/export.
8. **Add transaction** — BUY/SELL/DIVIDEND modal.

Every analytics surface carries the **non-advisory disclaimer** and a "hypothetical
/ for tracking only, not a demat account" note.

---

## 6. Architecture fit

- `src/lib/portfolio.ts` — model, storage, migration, ledger, P&L.
- `src/lib/portfolioMath.ts` — pure functions: covariance, β, VaR, drawdown, TWR/XIRR,
  factor z-scores (unit-testable, no IO).
- `src/lib/portfolioData.ts` — fetch+align candle matrices (reuses `api.candles`,
  the snapshot session cache, and the benchmark series).
- `src/pages/Portfolio.tsx` (+ `.css`) — the analytics view; Watchlist page gets the toggle.
- Charts via the existing lightweight-charts + small SVG/canvas for radar/heatmap.
- **Cloud:** `supabase/portfolio.sql` — `portfolios` table (jsonb positions+ledger)
  with owner-only RLS, plus `harden-grants` parity. Optional; local-first works offline.
- **Benchmark/dividends:** extend `backend/app/dataengine/export.py` to emit index
  candles (and optionally a per-symbol dividend list).

**Performance.** A 20–40 name book = 20–40 small candle fetches; do them in parallel,
cache in the existing session cache, and memoize the return matrix. Covariance on
40×250 is trivial in-browser. Lazy-load the analytics view so three.js-free.

---

## 7. Phasing

- **Phase 1 — Tracker ✅ DONE:** positions (qty + weighted avg cost), valuation, day &
  total P&L, weights, sector allocation, concentration (HHI/top), autocomplete, trade
  dates. Seed from a watchlist. Local-first.
- **Phase 2 — Risk ✅ DONE:** candle return matrix → volatility, drawdown, historical
  VaR/CVaR, **beta + tracking error + NAV-vs-market chart** (cap-weighted broad-market
  benchmark, since the spine has no index history), factor tilt.
- **Phase 3 — Attribution ✅ DONE:** return attribution (contribution to P&L) and risk
  attribution (per-holding share of volatility from the covariance matrix).
- **Phase 4 — Polish/monetize ✅ DONE:** CSV import/export, multi-portfolio compare,
  Pro tags on advanced cards, and **dividends / total-return** — cash dividends are
  parsed from NSE announcements into a SEPARATE `dividends` table (kept out of price
  adjustment), exported as `dividends.json`, and the portfolio shows estimated
  dividends + total return (price P&L + dividends since each entry date). Pure-%
  dividends are skipped (need face value); TWR/XIRR still pending dated lots.
  Note: dividend data populates on the next VM refresh.

---

## 8. Edge cases & correctness
- **Corporate actions:** bundle prices are split/bonus-adjusted, so price returns are
  consistent; cost basis entered in pre-split terms must be flagged/adjusted (store
  the trade date; if a split occurred after it, scale the lot).
- **Missing/short candle history** (new listings): degrade risk metrics gracefully,
  label "insufficient history (n<60d)".
- **Illiquid/quarantined symbols:** mark valuations as low-confidence.
- **Stale data:** all values stamped with `data_date`; "as of EOD <date>".
- **Mixed exchanges / duplicate ISIN:** key positions by ISIN where possible.
- **Zero/short positions:** support long-only first; flag shorts as out of scope.

## 9. Compliance & privacy
- Informational/tracking only; **not investment advice**, not a demat/broking account,
  no real-money settlement. Prominent disclaimer on every analytics view.
- Portfolio = personal financial data → **DPDP**: cloud rows are RLS owner-only,
  deletable on request; local-only by default. No sharing without explicit consent.
- No tax advice; realized-P&L export is data, not a tax computation.

## 10. Testing
- Unit-test `portfolioMath` against known fixtures (β, VaR, XIRR, drawdown, TWR).
- Golden-file a sample 5-stock book end-to-end (valuation → risk → attribution).
- Property tests: weights sum to 1; σ_p ≤ Σ w_iσ_i (diversification); HHI∈[1/N,1].
