import PublicLayout from "../components/PublicLayout";
import { Markdown } from "../lib/markdown";
import "./Tutorial.css";

// Public how-to page for new AND experienced users. Rendered from Markdown so
// it stays easy to edit and reuses the app's renderer (internal links work).
// Tone: factual, educational, SEBI-aware — never advisory.

const GUIDE = `TaurEye turns the whole NSE/BSE end-of-day universe into something you can *query* — filter ~5,800 stocks down to a short list, read each chart and company, and save or share the scan. This guide covers the fast start for new users and a power-user playbook for everyone else. Everything here is educational; TaurEye is not an investment adviser (see the [full disclaimer](/legal/disclaimer)).

## New here? Start in 5 minutes

1. **Create an account** — sign up with email or *Continue with Google*. You can also explore as a guest; an account adds watchlists, saved screens and sync.
2. **Open the [Screener](/app/screener).** Add one filter to begin — e.g. *Price (LTP) ≥ 100* — and hit Run. You'll see every matching stock.
3. **Add a second condition** to narrow it, e.g. *% vs 200-DMA > 0* (stocks above their long-term average). Filters combine with AND by default.
4. **Sort** by tapping a column header (say *% Chg*), then **open a stock's [Chart](/app/chart)** to see candles, moving averages, detected patterns and a factual company profile.
5. **Save the screen** so you can re-run it tomorrow on fresh data, or **Share** it — the link reproduces your exact filters and the matched list.

That's the core loop: *filter → review → save/share*. New to the concepts? Read [How to Use a Stock Screener](/blog/how-to-use-a-stock-screener) and [Build Your First Screen](/blog/build-your-first-screen).

## The main tools

### Screener
Filter the universe on price, volume, RSI, moving averages, 52-week range, ATR, MACD, market cap, and **support/resistance** (daily/weekly/monthly). Use the **⚙ Columns** menu to show/hide and reorder columns for clean screenshots, and **⬇ Export** for CSV, Excel or a branded A4 PDF. *Power tip:* combine a trend filter (*above 200-DMA*), a momentum filter (*RSI between 55 and 70*) and a liquidity floor (*volume > 100000*) to build a repeatable, noise-free scan.

### Natural-language screener
Type a plain-English query like *"rsi below 30 and above 200 dma"* or *"golden crossover"* and TaurEye turns it into a runnable screen — no syntax to learn. Unrecognised words are flagged so you can adjust. *Power tip:* it understands units (cr, lakh, k) and S/R timeframes ("near weekly support").

### Charts, patterns & company
Every stock's [Chart](/app/chart) draws candlesticks with the 9/20/50/100/200 moving averages, marks rule-based chart patterns (necklines, channels, trendlines) as lines, and shows a short factual **About the company** section. Add the stock to a watchlist or set a price alert right from here.

### AI analysis & reports
On a stock page you can generate an **AI analysis** (a short, factual read of the numbers) or a structured **AI report** (About, trend, momentum, 52-week context, corporate actions, detected patterns, summary). Both are strictly descriptive — never buy/sell advice — and always end with a disclaimer.

### Indices, FX & Fuel
[Indices & FX](/app/indices) shows NIFTY, BANK NIFTY, the broad indices and India VIX, depository receipts (ADRs/GDRs), and a **Fuel prices** tab — daily petrol/diesel/CNG/LPG for major Indian cities plus global prices shown in ₹. The top ticker keeps global markets and USD-INR in view.

### Watchlist & Portfolio
Build multiple **[watchlists](/app/watchlist)**, and track holdings in the **[Portfolio](/app/portfolio)** with live P&L, day change, allocation and "since add" — configure columns and export to CSV/Excel/PDF. Back up positions with the CSV export and re-import them anytime.

### Calculators, Alerts, Saved & Refer
Use the **[Calculators](/app/calculators)** (incl. a live currency converter), set price **[Alerts](/app/alerts)**, revisit **[Saved Screens](/app/saved)**, and share TaurEye via **[Refer & Earn](/app/refer)**.

## Power-user playbook

- **Stack conditions for precision.** A screen is only as sharp as its filters — layer trend + momentum + liquidity + a support/resistance condition to surface exactly the setups you care about, then save it.
- **Screen by support/resistance.** Filter *% from Support (D)* between 0 and 3 to find stocks resting on daily support, or *% from Resistance (W)* between -3 and 0 for names pressing weekly resistance. Add these columns to see the distances at a glance.
- **Turn a screen into a report.** Configure your columns, then Export a **branded PDF** (A4, 0.25" margins) to share a clean scan — Watchlist, Portfolio and Screener all support it.
- **Read levels across timeframes.** The chart's daily/weekly/monthly S/R and the moving-average stack together describe where price sits — pair with [RSI](/blog/understanding-rsi), [MACD](/blog/macd-explained-complete-guide) and [Bollinger/ATR](/blog/bollinger-bands-and-atr-volatility-guide).
- **Match the tool to your style.** Swing, positional and long-term approaches use different filters — see [Trading Styles](/blog/trading-styles-explained) and [Value/Growth/Momentum/Quality](/blog/investing-styles-value-growth-momentum-quality).
- **Mind the macro.** [Global markets](/blog/how-global-markets-affect-indian-stocks), [inflation & rates](/blog/inflation-interest-rates-and-equities) and the [event calendar](/blog/market-moving-events-india) move Indian stocks — context the screener can't give you.
- **On mobile,** the app updates over-the-air — new features arrive on relaunch, no store update needed.

## Good to know

- **Data is end-of-day**, corporate-action-adjusted so the latest bar equals the current price. Verify against official exchange sources before acting.
- **TaurEye is factual and SEBI-aware** — it screens, charts and explains; it never recommends buying or selling and is **not a SEBI-registered adviser**.
- Deepen the concepts anytime in **[Insights](/blog)** — 20+ plain-English explainers on indicators, screening, trading styles and the markets.

Ready? Open the **[Screener](/app/screener)** and build your first scan.`;

export default function Tutorial() {
  return (
    <PublicLayout>
      <article className="tut">
        <h1>How to use TaurEye</h1>
        <p className="pub-lead">
          A quick start for new users and a playbook for power users — screening, charts,
          watchlists, portfolio and more. Educational only, never investment advice.
        </p>
        <Markdown source={GUIDE} />
      </article>
    </PublicLayout>
  );
}
