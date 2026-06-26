// Insights / blog articles. Plain data so the Blog index and Article pages render
// from one source. Bodies are lightweight Markdown (see src/lib/markdown.tsx).
//
// Tone: factual, educational, SEBI-aware. NEVER advisory — no buy/sell calls, no
// return promises, no "recommendations". Explain concepts; let users decide.

export type Article = {
  slug: string;
  title: string;
  summary: string;
  category: "Basics" | "Screening" | "Indicators" | "Markets";
  date: string; // YYYY-MM-DD
  readMins: number;
  body: string;
};

export const ARTICLES: Article[] = [
  {
    slug: "how-to-use-a-stock-screener",
    title: "How to Use a Stock Screener (Beginner’s Guide)",
    summary:
      "A stock screener filters thousands of listed companies down to the few that meet your rules. Here’s how to use one well.",
    category: "Screening",
    date: "2026-06-10",
    readMins: 5,
    body: `A stock screener is a filter for the market. Instead of scrolling through ~5,800 listed Indian companies one by one, you describe the characteristics you care about — a price range, a sector, a technical condition — and the screener returns only the names that match.

## Why screeners matter
The Indian market has thousands of scrips across the NSE and BSE. No one can watch them all. A screener turns "find me companies like X" into a repeatable, objective query, so you spend your time analysing a short list rather than hunting.

## The building blocks of a screen
Most screens combine a few simple conditions with AND logic:

- **Price & market cap** — e.g. large caps only, or stocks above ₹100.
- **Technical filters** — above the 200-day moving average, RSI below 30, relative volume above 2×.
- **Fundamental filters** — sector, or a valuation/quality metric.
- **Sorting** — rank the matches by % change, volume, or any column.

Each filter you add narrows the list. Start broad, then tighten until the result set is small enough to review by hand.

## A practical workflow
1. Decide what you’re looking for in plain English (e.g. "liquid large caps near a 52-week high").
2. Translate it into a few filters.
3. Run the screen and sort the results.
4. Open the chart and the company page for the names that stand out.
5. Save the screen so you can re-run it tomorrow on fresh end-of-day data.

## A note on discipline
A screener finds candidates — it does not tell you what to buy. Treat the output as a starting point for your own research, and remember that past patterns never guarantee future results.

Ready to try it? Open the [Screener](/app/screener) and start with a single filter, then add more. Also see [Build Your First Screen](/blog/build-your-first-screen).`,
  },
  {
    slug: "understanding-rsi",
    title: "Understanding RSI: The Relative Strength Index",
    summary:
      "RSI is a momentum oscillator between 0 and 100. Learn what overbought and oversold really mean — and what they don’t.",
    category: "Indicators",
    date: "2026-06-11",
    readMins: 4,
    body: `The **Relative Strength Index (RSI)** is one of the most widely used momentum indicators. It measures the speed and size of recent price changes on a scale from 0 to 100.

## How it’s calculated
RSI compares the average size of up-moves to the average size of down-moves over a lookback period (commonly 14 days). When gains dominate, RSI rises toward 100; when losses dominate, it falls toward 0.

## Reading the levels
- **Above 70** — often called "overbought": the stock has risen quickly and momentum is stretched.
- **Below 30** — often called "oversold": the stock has fallen quickly.
- **Around 50** — momentum is balanced.

## The common misunderstanding
"Overbought" does not mean "sell" and "oversold" does not mean "buy". In a strong trend, RSI can stay above 70 (or below 30) for a long time. RSI describes momentum; it does not predict reversals on its own.

## How traders use it
RSI is most useful in combination with other context — the trend, support/resistance, and volume. Some watch for **divergence**, where price makes a new high but RSI does not, as a sign that momentum is fading. Others simply use RSI as a screening filter to surface stocks at an extreme.

In the [Screener](/app/screener) you can filter by RSI (for example, "RSI below 30") to build a list of stocks at a momentum extreme, then study each chart yourself. RSI is a lens, not a signal.`,
  },
  {
    slug: "moving-averages-50-200-dma",
    title: "Moving Averages: 50-DMA, 200-DMA and the Golden Cross",
    summary:
      "Moving averages smooth out noise to reveal a trend. Here’s what the 50- and 200-day averages mean.",
    category: "Indicators",
    date: "2026-06-12",
    readMins: 4,
    body: `A **moving average (MA)** is the average closing price over a set number of days, recalculated each day. It smooths out daily noise so the underlying trend is easier to see.

## SMA vs EMA
- **Simple Moving Average (SMA)** weights every day equally.
- **Exponential Moving Average (EMA)** gives more weight to recent days, so it reacts faster.

## The 50-day and 200-day
Two MAs are watched closely:

- The **50-DMA** reflects the medium-term trend.
- The **200-DMA** reflects the long-term trend. Many consider a stock trading above its 200-DMA to be in a long-term uptrend, and below it to be in a downtrend.

## Golden cross and death cross
- A **golden cross** is when the 50-DMA crosses *above* the 200-DMA — often read as a shift toward a longer uptrend.
- A **death cross** is the opposite — the 50-DMA crossing *below* the 200-DMA.

These crossovers are lagging by nature (they confirm a move after it has begun), so they describe what has happened rather than what will.

## Using MAs in screening
"Price above 200-DMA" is a popular filter to keep your list focused on stocks in an established uptrend. In the [Screener](/app/screener) you can filter on a stock’s position relative to its 50-DMA, and the chart overlays the 9/20/50/100/200 MAs so you can see them directly.`,
  },
  {
    slug: "read-candlestick-charts",
    title: "How to Read a Candlestick Chart",
    summary:
      "Each candle packs four prices — open, high, low, close — into one shape. Here’s how to read them.",
    category: "Basics",
    date: "2026-06-13",
    readMins: 4,
    body: `A **candlestick** summarises one period of trading (a day, week, or month) in a single shape, showing four prices: the **open**, **high**, **low**, and **close**.

## Anatomy of a candle
- The **body** spans the open and close.
- The thin lines above and below — the **wicks** (or shadows) — reach the high and low.
- A candle is usually coloured **green** when the close is above the open (an up day) and **red** when the close is below the open (a down day).

## What the shape suggests
- A **long body** means one side dominated the session.
- **Long wicks** mean price travelled far but was pushed back — a sign of indecision or rejection at those levels.
- A tiny body with long wicks (a **doji**) signals a balance between buyers and sellers.

## Timeframes change the picture
A daily candle shows one day; a weekly candle compresses five trading days into one. Switching timeframe (Daily / Weekly / Monthly) changes how much history each candle represents — useful for zooming out to the bigger trend.

## Reading "over range"
On a stock’s chart, the percentage shown as *over range* is the move from the first candle on screen to the latest close — i.e. across the whole visible range — not the one-day change. Switch the timeframe to change what that range covers.

Open any stock in the [Chart](/app/chart) view to see candlesticks with moving-average overlays.`,
  },
  {
    slug: "market-cap-large-mid-small",
    title: "Market Cap Explained: Large, Mid and Small Caps",
    summary:
      "Market capitalisation is a company’s size by market value. It shapes liquidity, volatility and index inclusion.",
    category: "Basics",
    date: "2026-06-14",
    readMins: 4,
    body: `**Market capitalisation** ("market cap") is the total market value of a company’s shares: the share price multiplied by the number of shares outstanding. It’s the standard way to measure a company’s size.

## The buckets
In India, SEBI classifies listed companies by their rank in market cap:

- **Large cap** — the top 100 companies by market cap.
- **Mid cap** — ranks 101 to 250.
- **Small cap** — 251 onward.

## Why size matters
- **Liquidity** — large caps usually trade in high volume, so it’s easier to buy and sell without moving the price. Small caps can be thinly traded.
- **Volatility** — smaller companies often swing more sharply.
- **Index inclusion** — benchmark indices like the NIFTY 50 are built from large caps.

## A data nuance
For some illiquid scrips, the exchange’s official *closing price* can differ slightly from the last traded price — both are valid, published numbers. It’s worth knowing which one a tool shows.

## Using cap in screening
Filtering by market cap is one of the most common ways to focus a screen — for example, "large caps only" for liquidity, or "small caps" to scan a more volatile universe. You can sort the [Screener](/app/screener) by Market Cap to see where companies rank.`,
  },
  {
    slug: "nifty-sensex-explained",
    title: "NIFTY and SENSEX: India’s Benchmark Indices Explained",
    summary:
      "The NIFTY 50 and the SENSEX are the headline gauges of Indian equities. Here’s what they track.",
    category: "Markets",
    date: "2026-06-15",
    readMins: 4,
    body: `When the news says "the market rose today", it usually means a benchmark **index** rose. In India the two headline indices are the **NIFTY 50** and the **SENSEX**.

## What an index is
An index is a basket of stocks combined into a single number, weighted (in these cases) by free-float market cap — so larger companies move it more. Tracking the index is a quick way to gauge the overall direction of the market.

## NIFTY 50 vs SENSEX
- The **NIFTY 50** (NSE) tracks 50 large-cap companies across sectors.
- The **SENSEX** (BSE) tracks 30 large companies.

They overlap heavily and usually move together. Alongside them sit sectoral and size indices — **BANK NIFTY**, **Nifty IT**, **Nifty Midcap 100**, **Nifty Smallcap 100**, and more — which show how a particular slice of the market is doing.

## Why watch indices
Indices give you context. A stock up 1% on a day the NIFTY is up 2% has actually underperformed the market. Index levels also frame "market breadth" — how broad a move is.

See live end-of-day levels for the major Indian and global indices, plus currencies and ADRs, on the [Indices & FX](/app/indices) page. Each one links out to its TradingView chart.`,
  },
  {
    slug: "india-vix",
    title: "India VIX: What the “Fear Index” Tells You",
    summary:
      "India VIX measures the market’s expectation of near-term volatility. It’s a gauge of nervousness, not direction.",
    category: "Markets",
    date: "2026-06-16",
    readMins: 3,
    body: `**India VIX** is the volatility index calculated by the NSE. It estimates how much volatility the market expects over the next 30 days, derived from the prices of NIFTY options.

## What the number means
- A **higher VIX** means traders are paying up for protection — they expect bigger swings. It tends to spike during sharp sell-offs, which is why it’s nicknamed the "fear index".
- A **lower VIX** means the market expects calmer conditions.

## What it does NOT tell you
VIX measures the *size* of expected moves, not their *direction*. A high VIX doesn’t mean the market will fall — only that moves (up or down) are expected to be larger. Treat it as a thermometer for nervousness.

## A useful context tool
Many people glance at India VIX to frame the day: a rising VIX alongside falling indices suggests stress; a falling VIX in a rising market suggests confidence. It’s one input among many.

You’ll find India VIX in the top-bar ticker and on the [Indices & FX](/app/indices) page.`,
  },
  {
    slug: "volume-and-relative-volume",
    title: "Volume and Relative Volume: Reading Conviction",
    summary:
      "Volume shows how many shares changed hands. Relative volume puts today’s activity in context.",
    category: "Indicators",
    date: "2026-06-17",
    readMins: 3,
    body: `**Volume** is the number of shares traded in a period. It’s a measure of participation — how much real activity is behind a price move.

## Why volume matters
A price move on heavy volume reflects broad participation and is generally seen as more meaningful than the same move on thin volume. Big moves on low volume can be fragile.

## Relative volume (RVOL)
Raw volume is hard to compare across stocks — a large cap trades millions of shares while a small cap trades thousands. **Relative volume** fixes this by comparing today’s volume to the stock’s own recent average:

- **RVOL of 1×** — average activity.
- **RVOL of 2×+** — unusually busy; something is drawing attention.

## How it’s used
Traders often scan for stocks with high relative volume to find where activity is concentrated, then look at the chart and any news for context. Like every indicator, RVOL describes *what is happening*, not *what will happen*.

In the [Screener](/app/screener), Rel Vol is a column you can sort and filter on.`,
  },
  {
    slug: "market-breadth-advance-decline",
    title: "Market Breadth: Advancers, Decliners and What They Mean",
    summary:
      "Breadth measures how many stocks are participating in a move — not just where the index closed.",
    category: "Markets",
    date: "2026-06-18",
    readMins: 3,
    body: `An index can rise while most stocks fall, if a few heavyweights do the lifting. **Market breadth** looks past the index number to ask: how many stocks are actually participating?

## Advancers vs decliners
The simplest breadth measure counts **advancing** stocks (closed up) against **declining** stocks (closed down). The **advance–decline (A/D) ratio** divides one by the other.

- **Broad strength** — far more advancers than decliners: the rally is widespread.
- **Narrow strength** — the index is up but decliners lead: the move is concentrated in a few names and may be less durable.

## Why it’s useful
Breadth adds nuance the index alone can hide. A market making new highs on shrinking breadth is worth a second look; a sell-off where breadth is already improving may be losing steam.

The dashboard’s **Market Breadth** panel shows the live advancers/decliners split and the share of equities that are green — a quick read on how broad the day’s move is.`,
  },
  {
    slug: "corporate-actions-adjusted-prices",
    title: "Corporate Actions: Splits, Bonuses, Dividends and Adjusted Prices",
    summary:
      "Splits and bonuses change the share count and price without changing value. Adjusted prices keep charts honest.",
    category: "Basics",
    date: "2026-06-19",
    readMins: 4,
    body: `A **corporate action** is a change a company makes to its shares. The common ones affect how a price chart looks, so it helps to understand them.

## Splits and bonuses
- A **stock split** divides each share into more shares at a proportionally lower price. A 1:2 split turns one ₹1,000 share into two ₹500 shares — the same total value.
- A **bonus issue** gives existing holders extra shares for free, which similarly lowers the per-share price.

In both cases your total value is unchanged on the action date; only the share count and per-share price change.

## Dividends
A **dividend** is a cash payout to shareholders. On the ex-dividend date the price typically drops by roughly the dividend amount.

## Why "adjusted" prices exist
If a chart showed the raw price across a split, you’d see a huge artificial gap that never reflected a real loss. **Adjusted prices** rescale the history so the series is continuous — past prices are adjusted as if today’s share structure always applied. This is what lets indicators like moving averages and % change be computed correctly across a corporate action.

That’s why a well-built chart "anchors" so the latest bar equals the current price while the history stays continuous and comparable.`,
  },
  {
    slug: "build-your-first-screen",
    title: "Build Your First Screen: A Step-by-Step Walkthrough",
    summary:
      "From a blank screener to a saved, shareable scan in a few minutes.",
    category: "Screening",
    date: "2026-06-20",
    readMins: 5,
    body: `Let’s build a simple screen end to end. The goal: **liquid large caps trading above their 200-day average** — a focused list of larger companies in a longer-term uptrend.

## Step 1 — start broad
Open the [Screener](/app/screener). It begins on the full universe of ~5,800 stocks. We’ll narrow it down.

## Step 2 — add filters
Add conditions one at a time (they combine with AND):

1. **Market cap** — restrict to large caps for liquidity.
2. **vs 200-DMA** — keep stocks trading above their 200-day moving average.
3. (Optional) **Rel Vol above 1.5×** — only names seeing above-average activity today.

Each filter shrinks the list. Watch the match count fall as you tighten.

## Step 3 — sort
Sort the results by **% Chg** or **Volume** to bring the most active names to the top.

## Step 4 — review
Click **Chart** on a row to study the price action, and **Report** for the factual company page. The screen surfaces candidates; the judgement is yours.

## Step 5 — save and share
**Save** the screen so you can re-run it tomorrow on fresh end-of-day data, and **Share** it — the link reproduces your exact filters and lists the matched stocks, so anyone you send it to sees the same scan.

## Plain-English screening
You can also describe a screen in words and let the natural-language screener translate it into filters — handy when you know what you want but not which column it maps to.

Screens are a process, not a prediction. Refine yours over time, and always do your own homework on the names it surfaces.`,
  },
  {
    slug: "adrs-gdrs-explained",
    title: "ADRs and GDRs: Indian Companies Listed Abroad",
    summary:
      "Some Indian companies also trade on foreign exchanges via depository receipts. Here’s how they work.",
    category: "Markets",
    date: "2026-06-21",
    readMins: 3,
    body: `Several large Indian companies are available to international investors through **depository receipts** — instruments that represent shares of a foreign company but trade on a local exchange.

## ADRs and GDRs
- An **ADR (American Depository Receipt)** lets a non-US company’s shares trade on a US exchange (NYSE or Nasdaq) in US dollars. Infosys (INFY), Wipro (WIT) and ICICI Bank (IBN) are examples.
- A **GDR (Global Depository Receipt)** is the broader, non-US equivalent, often listed in Europe.

A bank holds the underlying Indian shares and issues the receipts, so an ADR’s value tracks the home-market share price (adjusted for the exchange ratio and currency).

## Why watch them
- They show how global investors are pricing an Indian company outside Indian hours.
- Because the US market trades when India is closed, ADR moves can hint at sentiment before the next Indian session.

## A caveat
ADR prices reflect a different currency (USD) and time zone, and can diverge from the home-listed share for short stretches due to demand, liquidity, or currency moves. They’re a useful cross-reference, not a substitute for the home listing.

You can see the major Indian ADRs, with end-of-day levels, on the [Indices & FX](/app/indices) page under Depository Receipts.`,
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
