#!/usr/bin/env python3
import os, pathlib
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = pathlib.Path("/home/user/TaurEye")
OUT = str(ROOT / "TaurEye-Status.pdf")

REG, BOLD = "Helvetica", "Helvetica-Bold"
dj = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
djb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if os.path.exists(dj) and os.path.exists(djb):
    pdfmetrics.registerFont(TTFont("DJ", dj)); pdfmetrics.registerFont(TTFont("DJB", djb))
    REG, BOLD = "DJ", "DJB"

GREEN = colors.HexColor("#0F9D63")
GREEN_HDR = colors.HexColor("#128F63")
DARK = colors.HexColor("#11141a")
GREY = colors.HexColor("#E8EBEF")
GREYL = colors.HexColor("#F5F7F9")

h0 = ParagraphStyle("h0", fontName=BOLD, fontSize=20, leading=25, textColor=DARK, spaceAfter=7)
hsub = ParagraphStyle("hsub", fontName=REG, fontSize=9.5, textColor=colors.HexColor("#58616d"), spaceAfter=10)
h1 = ParagraphStyle("h1", fontName=BOLD, fontSize=13, textColor=GREEN_HDR, spaceBefore=10, spaceAfter=6)
cell = ParagraphStyle("cell", fontName=REG, fontSize=8.5, leading=11, textColor=DARK)
cellb = ParagraphStyle("cellb", fontName=BOLD, fontSize=8.5, leading=11, textColor=DARK)
cellg = ParagraphStyle("cellg", fontName=BOLD, fontSize=8.5, leading=11, textColor=GREEN)
hdr = ParagraphStyle("hdr", fontName=BOLD, fontSize=9, leading=11, textColor=colors.white)
note = ParagraphStyle("note", fontName=REG, fontSize=9, leading=13, textColor=DARK, spaceBefore=6)

def P(txt, st=cell):
    return Paragraph(txt, st)

def status_cell(s):
    st = cellg if ("LIVE" in s or s == "Live") else cellb
    return Paragraph(s, st)

status_rows = [
    ("Screening", "Filter-based screener", "Live", "Over the metrics bundle (~5,800 stocks)"),
    ("Screening", "Natural-language screener", "Live", "Plain-English &#8594; filters; signature feature"),
    ("Screening", "Saved screens", "Live", "Local; cloud table exists in schema"),
    ("Charts", "Native charts (lightweight-charts)", "Live", "Timeframes, moving averages"),
    ("Charts", "TradingView widget toggle", "Live", "TV's own data"),
    ("Charts", "Auto pattern detection", "Live", "Drawn as lines (patterns.ts)"),
    ("Charts", "Per-stock Key Data", "Live", "RSI, SMA50/200, 52w, ATR + SEBI disclaimer"),
    ("Data", "Global indices dashboard", "Live", "+ ticker"),
    ("Data", "Scrip search", "Live", ""),
    ("Engagement", "Watchlists", "Live", ""),
    ("Engagement", "EOD price alerts", "Live", "Above/below"),
    ("Engagement", "Push notifications (FCM)", "Live", "Native, via Firebase"),
    ("Engagement", "Light/dark theme", "Live", ""),
    ("Accounts", "Supabase auth (email + guest)", "Live", ""),
    ("Accounts", "Cloud credit wallet", "Live", "Server balance, unforgeable (RLS)"),
    ("Accounts", "Signup bonus (50) + daily claim (5)", "Live", "Secure RPCs"),
    ("Accounts", "Referral program", "Partial", "Tables + page exist; reward grant not wired"),
    ("AI / Reports", "AI stock analysis", "Built", "Edge Function (Haiku); needs deploy + ANTHROPIC_API_KEY"),
    ("AI / Reports", "Advanced report", "Built", "Credit sink"),
    ("Monetization", "Broker affiliate (Zerodha)", "LIVE &amp; earning", "Angel/Upstox/Dhan = paste links"),
    ("Monetization", "Ads — AdSense (web)", "Built, gated", "Needs ca-pub-… + unit IDs"),
    ("Monetization", "Ads — AdMob (app)", "Built, gated", "Needs IDs + APK rebuild + privacy policy"),
    ("Monetization", "Razorpay credit purchases", "Built", "Needs Razorpay account + webhook"),
    ("Monetization", "Credit charging", "Off (by design)", "Flip after AI + purchases live"),
    ("Monetization", "Pro subscription", "Planned", "Phase D (Rs 999/yr)"),
    ("Platforms", "Web (nginx, static)", "Live", "Deploys from main in ~1 min"),
    ("Platforms", "Android APK", "Builds", "GitHub Actions"),
    ("Platforms", "OTA updates (Capgo)", "Wired", "Needs CAPGO_TOKEN + CAPGO_ENABLED"),
    ("Platforms", "iOS", "Scaffolded", "Not a current build target"),
    ("Infra", "Nightly data pipeline", "Live", "EOD &#8594; CA-adjust &#8594; JSON export"),
    ("Infra", "Compliance (SEBI/RLS/secrets)", "In place", "Factual-only, keys server-side"),
]

comp_header = ["Capability", "TaurEye", "screener.in", "Chartink", "Trendlyne", "TradingView"]
comp_rows = [
    ("Primary focus", "Unified EOD screener (fund + tech)", "Fundamentals", "Technical scans", "Everything (fund+tech+analyst)", "Charting platform"),
    ("Fundamentals depth", "Key ratios (growing)", "Deep (10-yr) ★", "Minimal", "Broad + DVM scores", "Weak (India)"),
    ("Technical screening", "Yes", "Weak", "Strong ★", "Yes", "Generic"),
    ("Intraday / real-time", "No (EOD only)", "No", "Yes (near real-time)", "Partial", "Yes ★"),
    ("NL / plain-English screen", "Yes ★", "No (query lang)", "No (own syntax)", "No", "No (Pine Script)"),
    ("Charting", "Good", "Basic", "Basic", "Decent", "World-class ★"),
    ("Auto pattern detection", "Yes (drawn for you)", "No", "Via scans", "Some", "Via Pine/indicators"),
    ("Alerts", "Yes (EOD + push)", "Limited", "Yes", "Yes (paywalled)", "Yes"),
    ("AI stock analysis", "Yes (built-in, Haiku)", "No", "No", "Some", "Limited"),
    ("Mobile app quality", "Mobile-first native ★", "Mediocre", "Mediocre", "OK", "Good"),
    ("India focus", "Yes", "Yes", "Yes", "Yes", "No"),
    ("Price / year", "Free / Rs 999 Pro", "~Rs 5,000", "~Rs 2,400", "Rs 999–6,000", "~Rs 12,000+ (INR)"),
    ("Free tier", "Generous ★", "Limited", "Yes (ads)", "Heavily paywalled", "Limited"),
]

doc = SimpleDocTemplate(OUT, pagesize=landscape(A4), leftMargin=28, rightMargin=28, topMargin=26, bottomMargin=22)
el = [P("TaurEye — Where We Are", h0),
      P("Product status &amp; competitive comparison · NSE/BSE EOD stock screener · web + Android", hsub),
      P("1. Where We Are — detailed status", h1)]

# Status table
data = [[P("Area", hdr), P("Feature", hdr), P("Status", hdr), P("Notes", hdr)]]
for a, f, s, n in status_rows:
    data.append([P(a, cellb), P(f, cell), status_cell(s), P(n, cell)])
t = Table(data, colWidths=[78, 208, 92, 408], repeatRows=1)
ts = [
    ("BACKGROUND", (0, 0), (-1, 0), GREEN_HDR),
    ("GRID", (0, 0), (-1, -1), 0.5, GREY),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]
for i in range(1, len(data)):
    if i % 2 == 0:
        ts.append(("BACKGROUND", (0, i), (-1, i), GREYL))
t.setStyle(TableStyle(ts))
el.append(t)

el.append(P("2. Comparison with peers", h1))
data2 = [[P(h, hdr) for h in comp_header]]
for row in comp_rows:
    cells = [P(row[0], cellb), P(row[1], cellg)]
    cells += [P(v, cell) for v in row[2:]]
    data2.append(cells)
t2 = Table(data2, colWidths=[112, 150, 116, 116, 132, 160], repeatRows=1)
ts2 = [
    ("BACKGROUND", (0, 0), (-1, 0), GREEN_HDR),
    ("GRID", (0, 0), (-1, -1), 0.5, GREY),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]
for i in range(1, len(data2)):
    if i % 2 == 0:
        ts2.append(("BACKGROUND", (0, i), (-1, i), GREYL))
t2.setStyle(TableStyle(ts2))
el.append(t2)

el.append(P('<b>Our wedge:</b> we don\'t beat any one of them at their core strength — instead we bundle '
            'fundamentals + technicals + plain-English search + AI + patterns + alerts into one fast, '
            'mobile-first app, free to start, undercutting a field where everyone else charges Rs 2.4k–12k '
            'and silos their features.', note))

doc.build(el)
print("WROTE", OUT)
