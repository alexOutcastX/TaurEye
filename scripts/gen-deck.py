#!/usr/bin/env python3
import os
from reportlab.lib.colors import HexColor, black
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Spacer, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

W, H = 960, 540  # 16:9
GREEN = HexColor("#18C98C")
WHITE = HexColor("#FFFFFF")
GREY = HexColor("#9AA4B2")
BG = black

# Fonts: prefer DejaVu (renders Rs sign / arrows); fall back to Helvetica.
REG, BOLD = "Helvetica", "Helvetica-Bold"
for base, name, bold in [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]:
    if os.path.exists(base) and os.path.exists(bold):
        pdfmetrics.registerFont(TTFont("DejaVu", base))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", bold))
        REG, BOLD = "DejaVu", "DejaVu-Bold"

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
LOGO = os.path.join(ROOT, "public", "logo.png")
WORDMARK = os.path.join(ROOT, "public", "wordmark.png")
OUT = os.path.join(ROOT, "TaurEye-Where-We-Are.pdf")

title_style = ParagraphStyle("title", fontName=BOLD, fontSize=30, leading=36, textColor=GREEN, alignment=TA_LEFT)
bullet_style = ParagraphStyle("bullet", fontName=REG, fontSize=15.5, leading=23, textColor=WHITE, alignment=TA_LEFT, spaceAfter=7, leftIndent=20, firstLineIndent=-20)

def bullet(text):
    return Paragraph(f'<font color="#18C98C">–</font>&nbsp;&nbsp;{text}', bullet_style)

slides = [
    ("Product Snapshot", [
        "EOD screener covering ~5,800 NSE/BSE stocks",
        "Mobile-first, beginner-friendly, plain-English screening",
        "Positioning: bundle what screener.in / Chartink / Trendlyne paywall — free to start, Pro at Rs 999/yr vs their Rs 2.4k–6k",
        "Wedge: speed, unified fundamentals + technicals; swing / positional + investor focus (concede intraday)",
    ]),
    ("How We Compare", [
        "screener.in — deep fundamentals, ~Rs 5,000/yr, weak technicals &amp; mobile",
        "Chartink — technical &amp; intraday scans, ~Rs 2,400/yr, no fundamentals, cluttered UI",
        "Trendlyne — broad data + scores, Rs 999–6,000/yr, overwhelming &amp; pricey",
        "TradingView — world-class charts, ~Rs 12,000/yr in INR, not India-focused",
        "<b>TaurEye</b> — fundamentals + technicals + plain-English search + AI, mobile-first, free / Rs 999 Pro",
    ]),
    ("Pricing &amp; Plans", [
        "<b>Free</b> — full NL + technical screener, key fundamentals, 1 watchlist, limited AI via rewarded credits",
        "<b>Pro Rs 999/yr</b> (or Rs 149/mo) — no ads, unlimited screens &amp; watchlists, EOD alerts, generous AI",
        "<b>Pro+ Rs 1,999/yr</b> (later) — priority AI, advanced patterns, export, portfolio",
        "Credit packs — Rs 99 = 100, Rs 299 = 350, Rs 599 = 750 credits",
        "Undercuts screener.in (Rs 5,000) and Trendlyne (up to Rs 6,000) while bundling more",
    ]),
    ("Architecture — Fully Static", [
        "Nightly cron pulls EOD data into a SQLite spine, corporate-action-adjusts it",
        "Exports a JSON bundle (metrics, fundamentals, indices, per-symbol candles)",
        "nginx serves the SPA + bundle; the frontend does all work client-side",
        "Supabase is the only live service: accounts, credit wallet, Edge Functions",
    ]),
    ("Core Screening &amp; Analysis — Live", [
        "Filter-based stock screener over the metrics bundle",
        "Natural-language screener (plain English &#8594; filters) — signature feature",
        "Charts: native lightweight-charts + TradingView toggle, timeframes, moving averages",
        "Auto chart-pattern detection drawn as lines",
        "Per-stock Key Data (RSI, SMA50/200, 52w, ATR) with SEBI disclaimer",
        "Scrip search and global indices dashboard",
    ]),
    ("Engagement &amp; Retention — Live", [
        "Watchlists",
        "EOD price alerts (above / below)",
        "Native push notifications via Firebase (FCM)",
        "Saved screens",
        "Light / dark theme",
        "Accounts: Supabase email/password + guest mode",
    ]),
    ("Accounts &amp; Cloud Wallet — Live", [
        "Supabase accounts (sign up / log in / guest)",
        "Server-side credit wallet with real balance",
        "Signup bonus (50 credits) + daily claim (5) via secure RPCs",
        "Balances unforgeable (server ledger + row-level security)",
        "Referral program: tables + page exist, reward grant not yet wired",
    ]),
    ("AI &amp; Reports — Built, Staged", [
        "AI stock analysis via Supabase Edge Function (Claude Haiku, factual + disclaimer)",
        "Needs Edge Functions deployed + Anthropic API key to go live",
        "Advanced report feature present as a credit sink",
        "Charging stays off until AI + purchases are live",
    ]),
    ("Monetization Status", [
        "Broker affiliate (Zerodha): <font color='#18C98C'><b>LIVE</b></font> and earning",
        "Cloud wallet faucets: <font color='#18C98C'><b>LIVE</b></font>",
        "Ads (AdSense web + AdMob app): BUILT, gated on your IDs",
        "AI analysis credit sink: BUILT, needs Edge Functions + API key",
        "Razorpay credit purchases: BUILT, needs account + webhook",
        "Credit charging: OFF by design until features + top-up path are live",
        "Pro subscription: planned (Phase D)",
    ]),
    ("Traction &amp; Targets", [
        "North-star: monthly active users (MAU) and free-to-paid conversion",
        "Funnel tracked: installs, signups, screens run, AI calls, demat signups",
        "Four revenue legs: affiliate, ads, credits, Pro subscriptions",
        "Illustrative model at ~25k MAU/mo: affiliate Rs 35–50k, ads Rs 40–55k, Pro Rs 60–100k, credits/Pro+ Rs 30–50k",
        "Target blended: Rs 1.8–2.6 lakh/mo — <i>projection</i>; early stage, actuals filled as they come",
    ]),
    ("Platforms &amp; Distribution", [
        "Web: live on the VM via nginx, deploys from main in ~1 minute",
        "Android APK: builds via GitHub Actions",
        "Over-the-air updates (Capgo): wired, ships web bundles to installed apps",
        "iOS: scaffolded via Capacitor, not a current build target",
    ]),
    ("The Two Product Cycles", [
        "Data cycle (nightly, VM): ingest EOD &#8594; reconcile &#8594; corporate-action adjust &#8594; indicators &#8594; export JSON",
        "Release cycle (code): push to main &#8594; GitHub Actions builds SPA &#8594; rsync to nginx (excludes data) &#8594; live ~1 min",
        "Mobile: same push ships OTA; native changes need an APK rebuild",
    ]),
    ("Compliance &amp; Guardrails", [
        "SEBI: factual-only pages, prominent “not investment advice” disclaimer, descriptive-only AI",
        "Security: server-side credit ledger + RLS, LLM / payment keys server-only",
        "Closed-loop credits (no cash-out) to avoid RBI prepaid-instrument rules; 18% GST noted",
        "No secrets in git; production stays static",
    ]),
    ("Roadmap — Next Steps", [
        "Verify live signup &#8594; 50-credit flow (in testing)",
        "Step 5: deploy Edge Functions + Anthropic key &#8594; AI on",
        "Step 6: Razorpay for credit purchases &#8594; flip charging on",
        "Activate ads + add Angel One / Upstox / Dhan affiliate links",
        "Phase D: Pro subscription (Rs 999/yr)",
        "Growth: SEO screen landing pages, shareable / community screens, preset-scan library",
    ]),
    ("Status Summary", [
        "Fully live: screener, charts, patterns, NL search, watchlists, alerts, accounts, cloud wallet with real credits, Zerodha affiliate earning",
        "Monetization rails built and staged",
        "Waiting on external accounts (Anthropic key, Razorpay, ad IDs) and the deliberate “go” to start charging",
    ]),
]

c = canvas.Canvas(OUT, pagesize=(W, H))

def bg():
    c.setFillColor(BG); c.rect(0, 0, W, H, fill=1, stroke=0)

def footer(n):
    c.setFont(REG, 9); c.setFillColor(GREY)
    c.drawString(60, 24, "TaurEye  ·  Product Status")
    c.drawRightString(W - 60, 24, f"{n}/16")

# ---- Title slide ----
bg()
from reportlab.lib.utils import ImageReader
lg = ImageReader(LOGO); lw, lh = lg.getSize()
tw = 200.0; th = tw * lh / lw
c.drawImage(lg, (W - tw) / 2, 300, width=tw, height=th, mask="auto", preserveAspectRatio=True)
wm = ImageReader(WORDMARK); ww, wh = wm.getSize()
mw = 460.0; mh = mw * wh / ww
c.drawImage(wm, (W - mw) / 2, 300 - mh - 6, width=mw, height=mh, mask="auto", preserveAspectRatio=True)
c.setFont(BOLD, 16); c.setFillColor(WHITE)
c.drawCentredString(W / 2, 150, "Product Status — “Where We Are”")
c.setFont(REG, 12); c.setFillColor(GREY)
c.drawCentredString(W / 2, 126, "NSE / BSE end-of-day stock screener  ·  web + Android")
footer(1)
c.showPage()

# ---- Content slides ----
for i, (title, bullets) in enumerate(slides, start=2):
    bg()
    # green accent rule
    c.setFillColor(GREEN); c.rect(60, H - 78, 54, 4, fill=1, stroke=0)
    frame = Frame(60, 50, W - 120, H - 150, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, showBoundary=0)
    story = [Paragraph(title, title_style), Spacer(1, 16)] + [bullet(b) for b in bullets]
    frame.addFromList(story, c)
    footer(i)
    c.showPage()

c.save()
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
