#!/usr/bin/env python3
"""Generate TaurEye-Expert-Review.pdf — an independent fintech / institutional
review of the TaurEye app. Portrait A4, sectioned prose + a scorecard table.
"""
import os, pathlib
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, ListFlowable, ListItem, HRFlowable)
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = pathlib.Path("/home/user/TaurEye")
OUT = str(ROOT / "TaurEye-Expert-Review.pdf")

REG, BOLD = "Helvetica", "Helvetica-Bold"
dj = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
djb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if os.path.exists(dj) and os.path.exists(djb):
    pdfmetrics.registerFont(TTFont("DJ", dj)); pdfmetrics.registerFont(TTFont("DJB", djb))
    REG, BOLD = "DJ", "DJB"

GREEN = colors.HexColor("#0F9D63")
GREEN_HDR = colors.HexColor("#128F63")
DARK = colors.HexColor("#11141a")
MUT = colors.HexColor("#566270")
GREY = colors.HexColor("#E2E6EA")
GREYL = colors.HexColor("#F5F7F9")
RED = colors.HexColor("#C0392B")
ORANGE = colors.HexColor("#C77B12")

h0 = ParagraphStyle("h0", fontName=BOLD, fontSize=22, leading=26, textColor=DARK, spaceAfter=2)
hsub = ParagraphStyle("hsub", fontName=REG, fontSize=10, textColor=MUT, spaceAfter=4)
h1 = ParagraphStyle("h1", fontName=BOLD, fontSize=13.5, textColor=GREEN_HDR, spaceBefore=13, spaceAfter=5)
h2 = ParagraphStyle("h2", fontName=BOLD, fontSize=10.5, textColor=DARK, spaceBefore=7, spaceAfter=2)
body = ParagraphStyle("body", fontName=REG, fontSize=9.5, leading=13.5, textColor=DARK, spaceAfter=5)
bullet = ParagraphStyle("bullet", fontName=REG, fontSize=9.5, leading=13, textColor=DARK)
cell = ParagraphStyle("cell", fontName=REG, fontSize=8.7, leading=11, textColor=DARK)
cellb = ParagraphStyle("cellb", fontName=BOLD, fontSize=8.7, leading=11, textColor=DARK)
hdr = ParagraphStyle("hdr", fontName=BOLD, fontSize=8.7, leading=11, textColor=colors.white)
small = ParagraphStyle("small", fontName=REG, fontSize=8, leading=10.5, textColor=MUT, spaceBefore=2)


def P(t, st=body): return Paragraph(t, st)
def blist(items):
    return ListFlowable([ListItem(Paragraph(i, bullet), leftIndent=10, value="•") for i in items],
                        bulletType="bullet", bulletColor=GREEN, start="•",
                        leftIndent=8, spaceAfter=5, bulletFontSize=8)
def rule(): return HRFlowable(width="100%", thickness=0.6, color=GREY, spaceBefore=3, spaceAfter=7)

el = []
el.append(P("TaurEye — Independent Product Review", h0))
el.append(P("A fintech, institutional-investment &amp; trading perspective · NSE/BSE end-of-day equity screener (web + Android) · Reviewed 16 Jun 2026", hsub))
el.append(rule())

# ---------- 1. Executive summary ----------
el.append(P("1. Executive summary", h1))
el.append(P("TaurEye is a well-engineered, mobile-first <b>end-of-day (EOD) equity screener</b> for Indian "
            "markets (~5,800 NSE/BSE stocks). It bundles rule-based screening, a plain-English (natural-language) "
            "screen builder, client-side technical indicators and chart-pattern detection, lightweight charting, "
            "EOD alerts, and an LLM-assisted stock commentary/report — delivered over a fully static, "
            "precomputed data bundle with a Supabase cloud layer for accounts, a credit wallet and AI.", body))
el.append(P("<b>Verdict.</b> As a <b>retail discovery and idea-generation tool</b>, it is genuinely strong: fast, "
            "clean, SEBI-aware, and differentiated by its natural-language screener and built-in AI. Measured "
            "against <b>institutional / professional trading</b> standards it is, by design, a narrow slice — it is "
            "EOD-only, equities-only, with no real-time data, no derivatives/options analytics, no backtesting, and "
            "no portfolio, risk or execution tooling. The right framing is a premium retail screener, not a "
            "professional terminal — and on that basis the foundation is commercially credible.", body))
el.append(P("<b>Overall rating: 3.4 / 5</b> — a polished retail EOD screener with a clean compliance and "
            "monetization base; institutional-grade analytics are absent and would be a major build.", h2))

# ---------- 2. Architecture ----------
el.append(P("2. Product &amp; architecture", h1))
el.append(blist([
    "<b>Static EOD model.</b> A nightly job ingests EOD data into a SQLite spine, corporate-action-adjusts it "
    "(every series anchored so the latest bar = current price), and exports a JSON bundle (metrics, fundamentals, "
    "indices, per-symbol candles) served by nginx. The frontend does all screening/indicators/patterns client-side.",
    "<b>Cloud layer (Supabase).</b> Auth, an unforgeable server-side credit wallet (RLS + SECURITY DEFINER RPCs), "
    "and AI via Edge Functions (LLM key server-side, credits charged there).",
    "<b>Distribution.</b> Web (instant deploys), Android (Capacitor), with over-the-air web updates (Capgo) wired.",
]))
el.append(P("<b>Assessment.</b> The static-bundle architecture is an elegant cost/scale choice for EOD data: cheap, "
            "fast, CDN-friendly, resilient. The trade-off is structural — it <i>cannot</i> deliver intraday/real-time "
            "data, and any feature needing live computation (order flow, live options chains) is out of scope without "
            "a different backend.", body))

# ---------- 3. Capability assessment ----------
el.append(P("3. Capability assessment", h1))
el.append(P("<b>Screening &amp; discovery — strong.</b> Filterable across the full universe with no result cap "
            "(paginated), 16+ curated presets (golden/death cross, RSI extremes, 52-week breakouts, volume spikes, "
            "relative-volume, ATR/low-vol, large-cap filters), and a standout <b>natural-language screener</b> that "
            "maps plain English to filters (Chartink-style) over signal flags such as golden_cross, macd_bull_cross, "
            "gap_up/down, new_high_52w and relative volume. This is the product's sharpest differentiator.", body))
el.append(P("<b>Technical analysis — good.</b> Indicators include RSI-14, MACD histogram, SMA-20/50/200 (and % "
            "distance to each), 52-week high/low distance, ATR%, relative volume, and signal flags (golden/death "
            "cross, 20/50 cross, MACD cross, gaps, volume spike). Rule-based pattern detection draws lines for Cup &amp; "
            "Handle, Double Top/Bottom, Flag, Doji, Hammer, Shooting Star, Engulfing, MA cross and 52-week extremes.", body))
el.append(P("<b>Fundamentals — basic.</b> Quarterly financials (revenue, net profit, PBT, EPS, expenses), "
            "shareholding (promoter holding &amp; pledge, FII/DII), corporate actions and filings are ingested. There "
            "is no deep, normalized ratio suite (P/E, P/B, ROE/ROCE, debt/equity, 10-year history, cash-flow/balance-"
            "sheet quality), which is the core of fundamental screeners like screener.in.", body))
el.append(P("<b>Charting — good (retail).</b> Native lightweight-charts with MAs and an optional TradingView widget; "
            "auto-drawn patterns are a nice touch. Not a professional charting surface (no drawing tools suite, "
            "multi-pane studies, or tick data).", body))
el.append(P("<b>AI commentary &amp; reports — promising, watch guardrails.</b> Haiku-class model produces factual "
            "commentary and a structured report, charged server-side with refund-on-failure and a SEBI disclaimer. "
            "Quality and hallucination control and keeping output strictly non-advisory are the key ongoing risks.", body))

# ---------- 4. Data quality ----------
el.append(P("4. Data quality &amp; integrity", h1))
el.append(blist([
    "<b>Corporate-action adjustment</b> and continuous ISIN-regime stitching are handled — important and often "
    "mishandled by retail tools; a real strength.",
    "<b>EOD freshness</b> now publishes the same trading day's close on the evening run (recently fixed); a "
    "freshness stamp (data_date) is surfaced in-app. Notifications now fire only when the date actually advances.",
    "<b>Coverage caveats.</b> ~1,500 symbols are 'quarantined' and market-cap is unmatched for a meaningful subset "
    "(universe ~4,600–4,800 of ~5,500), so breadth/market-cap screens are directional, not exhaustive.",
    "<b>Single-source EOD risk.</b> A provider outage or archive/URL change silently freezes data; needs monitoring "
    "and a fallback source for production-grade reliability.",
]))
el.append(P("<b>Assessment.</b> Data hygiene is above typical retail standard, but it is single-source EOD with a "
            "non-trivial quarantine rate — acceptable for screening/education, not for anything execution-sensitive. "
            "The app correctly states data is not suitable for trade execution.", body))

# ---------- 5. Institutional / professional gaps ----------
el.append(P("5. Institutional &amp; professional gaps", h1))
el.append(P("Against a professional trading/investment workflow, the following are <b>absent by design</b> and define "
            "the ceiling of the current product:", body))
el.append(blist([
    "<b>No real-time / intraday data</b>, no Level-2 depth, no order-flow or VWAP/microstructure analytics.",
    "<b>No derivatives analytics</b> — despite F&amp;O context, there are no option chains, Greeks, OI/PCR, IV, or "
    "futures basis tools. A large gap for an Indian trading audience where F&amp;O dominates volumes.",
    "<b>No backtesting / strategy validation</b> — screens cannot be tested historically; signal efficacy is unproven.",
    "<b>No portfolio, P&amp;L, risk or attribution</b> — no holdings, exposure, drawdown, factor or benchmark analytics.",
    "<b>No quant/factor models</b> (value/quality/momentum scores, multi-factor ranking) or alternative data.",
    "<b>No execution / OMS / broker order routing</b> — broker links are affiliate sign-ups, not trading integration.",
    "<b>Shallow fundamentals</b> vs. dedicated fundamental platforms (no normalized 10-yr ratios / statements).",
]))

# ---------- 6. Trading utility ----------
el.append(P("6. Trading &amp; investment utility", h1))
el.append(P("<b>Best fit:</b> positional / swing and investor idea-generation on daily timeframes — breakout, "
            "trend (above-MA), mean-reversion (RSI), volume-thrust and 52-week setups, plus a fast watchlist/alert "
            "loop. The relative-volume and gap/52-week signals are practical screening primitives.", body))
el.append(P("<b>Not suitable for:</b> intraday/scalping, options/derivatives strategies, systematic/quant execution, "
            "or any institutional mandate requiring auditable data, backtests and risk controls. Pattern detection is "
            "heuristic and should be treated as a visual aid, not a validated signal.", body))

# ---------- 7. Compliance ----------
el.append(P("7. Compliance &amp; regulatory (India)", h1))
el.append(blist([
    "<b>Strong non-advisory posture:</b> factual-only framing, prominent SEBI disclaimers, explicit 'not a "
    "Registered Investment Adviser/Research Analyst', no buy/sell/target/tips. Legal pages (Terms, Privacy/DPDP, "
    "Refund, Disclaimer) are in place; broker promotion is framed as demat sign-up, not stock recommendation.",
    "<b>Closed-loop credits</b> (non-cashable) to stay clear of RBI prepaid-instrument rules; 18% GST acknowledged.",
    "<b>Watch-items:</b> AI output must stay strictly non-advisory at scale (the highest regulatory risk); preset "
    "names and any 'idea'/'pick' language should avoid implied recommendation; substantiate factual claims; finalize "
    "lawyer review and fill the legal-entity details before public launch.",
]))

el.append(P("8. Security &amp; data protection", h1))
el.append(blist([
    "<b>Good:</b> server-authoritative wallet, row-level security, a security_invoker balance view, locked-down "
    "EXECUTE grants on SECURITY DEFINER functions, secrets server-side only, refund-on-failure on paid AI.",
    "<b>Gaps:</b> production still serves over <b>cleartext HTTP</b> (blocks iOS ATS; weak trust signal) — HTTPS is "
    "the top pre-launch fix; leaked-password protection is off (gated behind a paid tier); single-VM hosting is a "
    "single point of failure with no stated DR.",
]))

el.append(P("9. Monetization &amp; commercial model", h1))
el.append(P("Free tier + ads + broker affiliate, with credits metering premium AI and a future Pro subscription. "
            "Credit economy is live and server-charged (AI 10, report 5); AI unit economics look healthy (model cost "
            "far below credit price). Sensible, diversified, and well-staged. Risks: AI cost drift if usage scales, "
            "thin moat (signals are replicable), and conversion dependence on the AI/Pro value being compelling vs. "
            "free incumbents (Chartink) and deep fundamental tools (screener.in).", body))

el.append(Spacer(1, 4))

# ---------- Scorecard ----------
el.append(P("10. Scorecard", h1))
rows = [
    ("Screening &amp; discovery", "4.5 / 5", "NL screener + presets; the standout strength"),
    ("Technical analysis", "4.0 / 5", "Solid indicator/flag set; heuristic patterns"),
    ("Charting", "3.5 / 5", "Clean retail charts; not a pro surface"),
    ("Fundamental analysis", "2.5 / 5", "Quarterlies + shareholding; no deep ratios"),
    ("Data quality / freshness", "3.0 / 5", "CA-adjusted EOD; single-source, quarantine rate"),
    ("AI commentary / reports", "3.5 / 5", "Differentiator; guardrails are the risk"),
    ("Derivatives / options", "1.0 / 5", "Absent — major gap for Indian traders"),
    ("Institutional / quant tooling", "1.5 / 5", "No backtest / portfolio / risk / factors"),
    ("Compliance posture (retail)", "4.0 / 5", "Strong non-advisory framing + legal pages"),
    ("Security &amp; data protection", "3.5 / 5", "Good cloud security; HTTP/DR gaps"),
    ("Monetization design", "4.0 / 5", "Diversified, well-staged, healthy AI margin"),
    ("Mobile UX / polish", "4.0 / 5", "Fast, clean, mobile-first"),
]
data = [[P("Dimension", hdr), P("Rating", hdr), P("Note", hdr)]]
for a, b, c in rows:
    data.append([P(a, cellb), P(b, cellb), P(c, cell)])
t = Table(data, colWidths=[150, 55, 300], repeatRows=1)
ts = [("BACKGROUND", (0,0), (-1,0), GREEN_HDR), ("GRID", (0,0), (-1,-1), 0.5, GREY),
      ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
      ("LEFTPADDING",(0,0),(-1,-1),6), ("RIGHTPADDING",(0,0),(-1,-1),6)]
for i in range(1, len(data)):
    if i % 2 == 0: ts.append(("BACKGROUND", (0,i), (-1,i), GREYL))
t.setStyle(TableStyle(ts))
el.append(t)

# ---------- Recommendations ----------
el.append(P("11. Recommendations (prioritized)", h1))
el.append(P("<b>Near-term (pre-launch / weeks):</b>", h2))
el.append(blist([
    "Ship <b>HTTPS</b> on the VM (unblocks iOS, trust, SEO); complete lawyer review and legal-entity details.",
    "Add <b>EOD data-quality monitoring</b> (freshness + coverage alarms) and a second EOD source as fallback.",
    "Tighten <b>AI guardrails</b>: enforce non-advisory output, add evaluation/QA on samples, log and review.",
    "Reduce the quarantine / market-cap-unmatched rate to make breadth and cap filters trustworthy.",
]))
el.append(P("<b>Medium-term (differentiation):</b>", h2))
el.append(blist([
    "Add <b>backtesting</b> for screens/signals — the single highest-credibility upgrade for a screener.",
    "Add a <b>watchlist portfolio view</b> (returns, exposure, simple risk) — natural next step from watchlists.",
    "Deepen <b>fundamentals</b> into normalized ratios + multi-year history to compete with fundamental tools.",
]))
el.append(P("<b>Strategic (new TAM):</b>", h2))
el.append(blist([
    "<b>Derivatives module</b> (option chain, OI/PCR, IV, basis) — the biggest Indian-trader gap; needs a live feed.",
    "<b>Quant/factor scores</b> (value/quality/momentum ranking) as a premium, defensible layer.",
    "Optional <b>near-real-time</b> tier for active traders (separate live backend from the static EOD bundle).",
]))

el.append(rule())
el.append(P("Prepared as an independent expert review of the current build. Ratings are qualitative and reflect a "
            "professional-standards lens; TaurEye is positioned and disclaimed as an information/education tool, not "
            "investment advice. This document is an assessment, not a recommendation to invest.", small))

SimpleDocTemplate(OUT, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm,
                  topMargin=14*mm, bottomMargin=13*mm,
                  title="TaurEye — Independent Product Review").build(el)
print("WROTE", OUT)
