#!/usr/bin/env python3
import os, pathlib, datetime
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = pathlib.Path("/home/user/TaurEye")
OUT = str(ROOT / "TaurEye-Progress.pdf")

REG, BOLD = "Helvetica", "Helvetica-Bold"
dj = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
djb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if os.path.exists(dj) and os.path.exists(djb):
    pdfmetrics.registerFont(TTFont("DJ", dj)); pdfmetrics.registerFont(TTFont("DJB", djb))
    REG, BOLD = "DJ", "DJB"

GREEN = colors.HexColor("#0F9D63")
GREEN_HDR = colors.HexColor("#128F63")
AMBER = colors.HexColor("#B7791F")
GREYTXT = colors.HexColor("#6b7280")
DARK = colors.HexColor("#11141a")
GREY = colors.HexColor("#E8EBEF")
GREYL = colors.HexColor("#F5F7F9")

h0 = ParagraphStyle("h0", fontName=BOLD, fontSize=20, leading=25, textColor=DARK, spaceAfter=4)
hsub = ParagraphStyle("hsub", fontName=REG, fontSize=9.5, textColor=GREYTXT, spaceAfter=10)
h1 = ParagraphStyle("h1", fontName=BOLD, fontSize=13, textColor=GREEN_HDR, spaceBefore=12, spaceAfter=6)
cell = ParagraphStyle("cell", fontName=REG, fontSize=8.4, leading=10.5, textColor=DARK)
cellb = ParagraphStyle("cellb", fontName=BOLD, fontSize=8.4, leading=10.5, textColor=DARK)
hdr = ParagraphStyle("hdr", fontName=BOLD, fontSize=9, leading=11, textColor=colors.white)
note = ParagraphStyle("note", fontName=REG, fontSize=9, leading=13, textColor=DARK, spaceBefore=8)

def P(t, s=cell): return Paragraph(t, s)

def status_cell(s):
    col = GREEN if ("Live" in s or "LIVE" in s) else (AMBER if ("Built" in s or "Wired" in s or "Working" in s) else DARK)
    st = ParagraphStyle("sx", fontName=BOLD, fontSize=8.4, leading=10.5, textColor=col)
    return Paragraph(s, st)

# (area, item, status, notes)
progress = [
    ("Screening", "Filter screener + Natural-language screener", "Live", "Over the ~5,800-stock metrics bundle; plain-English signature feature"),
    ("Screening", "Saved screens", "Live", "Local; cloud table in schema"),
    ("Charts", "Native + TradingView charts, MAs, timeframes", "Live", "lightweight-charts + TV widget toggle"),
    ("Charts", "Auto pattern detection + per-stock Key Data", "Live", "Patterns drawn; RSI/SMA/52w/ATR + SEBI disclaimer"),
    ("Data view", "Global indices dashboard + ticker, scrip search", "Live", ""),
    ("Engagement", "Watchlists, EOD price alerts, push (FCM), theme", "Live", "Firebase push for alerts"),
    ("Accounts", "Email/password + guest auth", "Live", "Supabase Auth"),
    ("Accounts", "Social logins (Google, X, GitHub, Apple, Facebook)", "Built", "Code live; each provider must be ENABLED in Supabase"),
    ("Accounts", "Cloud credit wallet (server-side, RLS)", "Live", "Unforgeable balance + ledger"),
    ("Accounts", "Signup bonus (50) + daily claim (5)", "Live", "Secure SECURITY DEFINER RPCs"),
    ("AI", "AI stock analysis (Claude Haiku)", "Live", "Deployed Edge Function; markdown-formatted output"),
    ("AI", "AI Report -> printable PDF (credit-linked)", "Built", "Deploy the ai-report Edge Function to switch on"),
    ("Monetization", "Broker affiliate (Zerodha)", "LIVE & earning", "Angel/Upstox/Dhan = paste links"),
    ("Monetization", "Ads - AdSense (web) + AdMob (app)", "Built", "Gated; need publisher/ad-unit IDs (AdMob also APK rebuild)"),
    ("Monetization", "Razorpay credit purchases", "Built", "Needs Razorpay account + webhook"),
    ("Monetization", "Credit charging", "Off (by design)", "Flip CHARGE_CREDITS after AI + purchases live"),
    ("Data pipeline", "Nightly EOD pull + CA-adjust + JSON export", "Live", "On the Oracle VM"),
    ("Data pipeline", "Fundamentals tables + per-symbol funda export", "Built", "financials / balance_sheets / shareholding / announcements"),
    ("Data pipeline", "Corporate actions (free, in export)", "Live", "Splits/bonus/dividends"),
    ("Data pipeline", "BSE financials / shareholding / announcements", "Blocked", "BSE bot-walls datacenter IPs - proven dead end"),
    ("Data pipeline", "EODHD vendor integration (deep fundamentals)", "Built, dormant", "Deferred - $99/mo plan; flips on with one secret"),
    ("Platforms", "Web (static, nginx) + Android APK build", "Live", "Deploys from main in ~1 min"),
    ("Platforms", "OTA updates (Capgo) + phone Data-ops workflow", "Wired", "Capgo needs token/enable; ops workflow live"),
    ("Compliance", "SEBI factual + disclaimers, RLS, server-only keys", "Live", "No advice; closed-loop credits"),
]

# (priority, item, owner, action)
pending = [
    ("Now", "Enable Google + GitHub social providers", "You", "Supabase -> Auth -> Providers (+ client id/secret + callback URL)"),
    ("Now", "Show only enabled social buttons", "You", "Set repo variable VITE_OAUTH_PROVIDERS=google,github"),
    ("Now", "Turn on AI Report", "You", "Deploy 'ai-report' Edge Function (dashboard paste); reuses ANTHROPIC_API_KEY"),
    ("Now", "Publish corporate actions to the app", "You", "Run 'export --funda --gz' via the phone Data-ops workflow"),
    ("Earn", "Add Angel One / Upstox / Dhan affiliate links", "You", "Paste tracking URLs into src/config/brokers.ts"),
    ("Earn", "Web ads", "You", "AdSense account -> set VITE_ADSENSE_CLIENT + slot IDs"),
    ("Earn", "App ads", "You", "AdMob app + IDs + privacy policy, then one APK rebuild"),
    ("Payments", "Razorpay credit purchases", "You", "KYC + create payments (notes user_id/product_id) + webhook URL"),
    ("Payments", "Flip credit charging on", "Dev", "After purchases live: set CHARGE_CREDITS=true, drop client-side AI debit"),
    ("Payments", "GST registration (18% on credit sales)", "You", "Before charging real money"),
    ("Data", "Decide deep-fundamentals vendor", "You", "EODHD $99/mo (or alt) -> unlocks balance sheet/debt/holdings in report"),
    ("Mobile", "OTA one-time setup", "You", "Capgo account -> CAPGO_TOKEN secret + CAPGO_ENABLED=true"),
    ("Backlog", "Wire referral reward grant", "Dev", "Tables/page exist; grant credits on qualified referral"),
    ("Backlog", "Pro subscription tier (Rs 999/yr)", "Dev", "After purchases; shared infra"),
    ("Backlog", "Growth multipliers", "Dev", "SEO screen landing pages, shareable/community screens, preset library"),
    ("Backlog", "Native social login", "Dev", "Capacitor deep-link handling + APK rebuild"),
]

def make_table(rows, headers, widths, status_col=None, prio_col=None):
    data = [[P(h, hdr) for h in headers]]
    for r in rows:
        cells = []
        for i, v in enumerate(r):
            if status_col is not None and i == status_col:
                cells.append(status_cell(v))
            elif i == 0:
                cells.append(P(v, cellb))
            else:
                cells.append(P(v, cell))
        data.append(cells)
    t = Table(data, colWidths=widths, repeatRows=1)
    ts = [("BACKGROUND", (0, 0), (-1, 0), GREEN_HDR),
          ("GRID", (0, 0), (-1, -1), 0.5, GREY),
          ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
          ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]
    for i in range(1, len(data)):
        if i % 2 == 0:
            ts.append(("BACKGROUND", (0, i), (-1, i), GREYL))
    t.setStyle(TableStyle(ts))
    return t

today = datetime.date.today().strftime("%d %b %Y")
doc = SimpleDocTemplate(OUT, pagesize=landscape(A4), leftMargin=28, rightMargin=28, topMargin=26, bottomMargin=22)
el = [P("TaurEye - Progress Report", h0),
      P(f"NSE/BSE EOD stock screener (web + Android) &#183; status as of {today}", hsub),
      P("1. Progress - what's built &amp; live", h1),
      make_table(progress, ["Area", "Item", "Status", "Notes"], [70, 250, 80, 388], status_col=2),
      P("2. Pending - actions to ship the rest", h1),
      make_table(pending, ["Priority", "Item", "Owner", "Action"], [62, 232, 46, 448]),
      P("<b>Headline:</b> the product is fully usable today - screener, charts, patterns, NL search, watchlists, "
        "alerts, accounts (incl. social-login code), cloud wallet with real credits, live AI analysis, and the "
        "Zerodha affiliate already earning. What's pending is mostly your external accounts (ad IDs, Razorpay, "
        "social-provider keys) and the deliberate switch-ons (deploy ai-report, flip charging). Deep fundamentals "
        "(balance sheet/debt/holdings) await a data vendor; everything else is built to plug it in.", note)]
doc.build(el)
print("WROTE", OUT)
