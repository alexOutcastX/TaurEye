import { Suspense, lazy } from "react";
import { Capacitor } from "@capacitor/core";
import AuthPanel from "../components/AuthPanel";
import BullMark from "../components/BullMark";
import ErrorBoundary from "../components/ErrorBoundary";
import "./Landing.css";

// three.js is heavy — keep it out of the main bundle and only fetch it when the
// landing hero mounts. Until it loads (or if WebGL is unavailable) the static
// SVG mark stands in. We only attempt the WebGL bull on the web: Android WebView
// GPU support is inconsistent, so native shows the static mark for a guaranteed
// clean boot.
const BullScene = lazy(() => import("../components/BullScene"));

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Screen 5,800+ NSE/BSE stocks",
    body: "Build precise filters on price, volume, RSI, moving averages, 52-week range and more — across the whole EOD universe, instantly.",
  },
  {
    title: "Plain-English screens",
    body: 'Type "golden crossover" or "rsi below 30 and above 200 dma" and TaurEye turns it into a runnable screen — Chartink-style, no syntax to learn.',
  },
  {
    title: "Chart patterns, drawn",
    body: "Rule-based detection traces necklines, channels and trendlines right on the chart — descriptive, never a buy/sell call.",
  },
  {
    title: "AI analysis & reports",
    body: "Factual, SEBI-aware commentary and a structured, printable report per stock — about, key data, corporate actions and detected patterns.",
  },
  {
    title: "Watchlist with entry tracking",
    body: "Save scrips with the price and date you added them, and see the change since — plus one-tap chart, report and AI report.",
  },
  {
    title: "EOD alerts & corporate actions",
    body: "Set price alerts and review splits, bonuses and dividends — every metric corporate-action-adjusted so today's bar is the real price.",
  },
];

export default function Landing() {
  // Evaluate at render time (not module load) so Capacitor is fully initialised
  // on-device — guarantees the WebGL bull is never attempted on native.
  const native = Capacitor.isNativePlatform();
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand">
          <BullMark size={28} />
          <img src="/wordmark.png" alt="TaurEye" className="lp-wordmark" />
        </div>
        <span className="lp-nav-tag">NSE / BSE end-of-day screener</span>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1>
            Watch. Analyze. <span className="lp-accent">Trade smarter.</span>
          </h1>
          <p className="lp-lede">
            A fast, mobile-first stock screener for Indian markets — powerful
            filters, chart patterns, plain-English screens and AI-assisted
            research, built on corporate-action-adjusted EOD data.
          </p>
          <ul className="lp-bullets">
            <li>✓ Free to use · no live-trading, no tips — research only</li>
            <li>✓ Works on web and Android, online or offline</li>
            <li>✓ Factual, SEBI-aware — never advisory</li>
          </ul>
        </div>

        <div className="lp-hero-visual">
          {native ? (
            <BullMark size={220} className="lp-bull-fallback" />
          ) : (
            <ErrorBoundary fallback={<BullMark size={220} className="lp-bull-fallback" />}>
              <Suspense fallback={<BullMark size={220} className="lp-bull-fallback" />}>
                <BullScene className="lp-bull" />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        <aside className="lp-auth">
          <h2 className="lp-auth-title">Get started</h2>
          <p className="lp-auth-sub">Sign in to save screens, watchlists and alerts.</p>
          <AuthPanel />
        </aside>
      </section>

      <section className="lp-features">
        <h2 className="lp-sec-title">Everything you need to research a stock</h2>
        <div className="lp-feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="lp-feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-compliance">
        <h2 className="lp-sec-title">Compliance &amp; disclaimers</h2>
        <div className="lp-disc">
          <p>
            <strong>Not investment advice.</strong> TaurEye is an information and
            education tool. It is <strong>not a SEBI-registered Investment Adviser
            or Research Analyst</strong> and provides no buy/sell/hold
            recommendations, price targets, tips or portfolio management.
          </p>
          <p>
            <strong>Data.</strong> Figures are derived from public NSE/BSE
            end-of-day sources, are corporate-action-adjusted on a best-effort
            basis, may be delayed or contain errors, and are{" "}
            <strong>not suitable for trade execution</strong> — always verify
            against official exchange sources.
          </p>
          <p>
            <strong>Market risk.</strong> Securities investments are subject to
            market risks. Past performance and technical indicators do not
            guarantee future results. Consult a SEBI-registered adviser before
            investing. AI-generated commentary is informational only and may be
            inaccurate.
          </p>
          <p className="lp-disc-fine">
            By continuing you acknowledge these terms. TaurEye, its owners and
            contributors accept no liability for any loss arising from use of the
            app or reliance on its data.
          </p>
        </div>
      </section>

      <footer className="lp-foot">
        <span>© {new Date().getFullYear()} TaurEye · For research, not investment advice.</span>
        <span>NSE · BSE · End-of-day data</span>
      </footer>
    </div>
  );
}
