import PublicLayout from "../components/PublicLayout";
import { Markdown } from "../lib/markdown";

const ABOUT = `TaurEye is an end-of-day (EOD) stock **screener** for the Indian markets (NSE / BSE). It helps you filter thousands of listed companies down to the few that match your rules — by price, market cap, technical condition, sector and more — and then study them with clean charts and factual company pages.

## What we do
- **Screen** ~5,800 listed stocks with stackable filters, a plain-English (natural-language) screener, and saveable, shareable scans.
- **Chart** any scrip with candlesticks and moving-average overlays, plus rule-based pattern detection.
- **Track** the major Indian and global indices, currencies and Indian ADRs/GDRs — each linking out to its TradingView chart.
- **Organise** your work with watchlists, alerts and a research-only workflow.

## How it works
TaurEye is built on a precomputed, corporate-action-adjusted EOD data bundle that refreshes nightly. The screening, indicators and chart pattern detection all run on your device — so the app is fast, works offline once loaded, and never needs you to wait on a live server.

## Our principles
- **Factual, not advisory.** TaurEye surfaces candidates and presents data. It does not give buy/sell calls, price targets or "tips". The judgement is always yours.
- **SEBI-aware.** Content stays educational and carries clear disclaimers.
- **Built for India.** NIFTY/BANKNIFTY context, NSE/BSE coverage, INR throughout.

## Learn the concepts
New to screening or technical indicators? Start with our [Insights](/blog) articles — plain-English explainers on RSI, moving averages, market cap, breadth and more.

## A clear disclaimer
TaurEye is an information and education tool, not a registered investment adviser or research analyst. Nothing in the app or on this site is investment advice. Markets carry risk; figures may be delayed or contain errors — always verify with the respective exchange and do your own research. See our [Disclaimer](/legal/disclaimer) and [Terms of Service](/legal/terms) for the full position.

Questions? Reach us on the [Contact](/contact) page.`;

export default function About() {
  return (
    <PublicLayout>
      <h1>About TaurEye</h1>
      <p className="pub-lead">
        A fast, factual, SEBI-aware stock screener for Indian markets — research, not advice.
      </p>
      <Markdown source={ABOUT} />
    </PublicLayout>
  );
}
