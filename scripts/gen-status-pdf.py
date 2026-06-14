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
RED = colors.HexColor("#C0392B")
ORANGE = colors.HexColor("#C77B12")
GREYTX = colors.HexColor("#7A828D")
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

prio_red = ParagraphStyle("prio_red", fontName=BOLD, fontSize=8.5, leading=11, textColor=RED)
prio_org = ParagraphStyle("prio_org", fontName=BOLD, fontSize=8.5, leading=11, textColor=ORANGE)
prio_grey = ParagraphStyle("prio_grey", fontName=REG, fontSize=8.5, leading=11, textColor=GREYTX)

def priority_cell(p):
    if p == "Blocker":
        return Paragraph(p, prio_red)
    if p == "High":
        return Paragraph(p, prio_org)
    if p in ("Later", "Skipped"):
        return Paragraph(p, prio_grey)
    return Paragraph(p, cellb)

status_rows = [
    ("Screening", "Filter-based screener", "Live", "Over the metrics bundle (~5,800 stocks)"),
    ("Screening", "Natural-language screener", "Live", "Plain-English &#8594; filters; signature feature"),
    ("Screening", "Saved screens", "Live", "Local; cloud table exists in schema"),
    ("Charts", "Native charts (lightweight-charts)", "Live", "Timeframes, moving averages"),
    ("Charts", "TradingView widget toggle", "Live", "TV's own data"),
    ("Charts", "Auto pattern detection", "Live", "Drawn as lines (patterns.ts)"),
    ("Charts", "Per-stock Key Data", "Live", "RSI, SMA50/200, 52w, ATR + SEBI disclaimer"),
    ("Data", "Dashboard home (Market Pulse)", "Live", "Index cards, breadth, sector heatmap, movers; post-login home"),
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
    ("AI / Reports", "AI stock analysis", "Live", "Haiku via Edge Function; charged 10 credits server-side"),
    ("AI / Reports", "Advanced report", "Live", "Charged 5 credits server-side; refund on failure"),
    ("Monetization", "Credit charging", "LIVE", "CHARGE_CREDITS=true; server-authoritative, badge live-refresh"),
    ("Monetization", "Broker affiliate (Zerodha)", "LIVE &amp; earning", "Angel/Upstox/Dhan = paste links"),
    ("Monetization", "Ads — AdSense (web)", "Built, gated", "Needs ca-pub-… + unit IDs"),
    ("Monetization", "Ads — AdMob (app)", "Built, gated", "Needs IDs + APK rebuild"),
    ("Monetization", "Razorpay credit purchases", "Built", "Webhook exists; needs checkout + keys"),
    ("Monetization", "Pro subscription", "Planned", "Phase D (Rs 999/yr)"),
    ("Compliance", "Legal pages (Terms/Privacy/Refund/Disclaimer)", "Live", "Public /legal/* routes; entity details in config/legal.ts"),
    ("Compliance", "Web launch hygiene", "Live", "robots.txt, sitemap, PWA manifest, signup consent, cookie notice, 404"),
    ("Compliance", "Security hardening", "Live", "RLS + security_invoker balance view + anon EXECUTE locked down"),
    ("Platforms", "Web (nginx, static)", "Live", "Deploys from main in ~1 min"),
    ("Platforms", "Android APK", "Builds", "GitHub Actions"),
    ("Platforms", "OTA updates (Capgo)", "Wired", "Needs CAPGO_TOKEN + CAPGO_ENABLED + one rebuild"),
    ("Platforms", "iOS", "Scaffolded", "Not a current build target"),
    ("Infra", "Nightly data pipeline", "Live", "EOD &#8594; CA-adjust &#8594; JSON export"),
    ("Infra", "Compliance (SEBI/secrets)", "In place", "Factual-only, keys server-side"),
]

# Pending for production launch: (Item, Priority, Owner, Note)
pending_rows = [
    ("HTTPS on the VM", "Blocker", "You / infra", "Cleartext HTTP today; needed for trust + iOS ATS. TLS cert &#8594; flip bases to https"),
    ("Lawyer review of legal text", "Blocker", "You", "SEBI / DPDP / GST specifics before public launch"),
    ("Fill config/legal.ts", "High", "You &#8594; me", "Registered name, support/grievance email, jurisdiction"),
    ("Broker affiliate links", "High", "You &#8594; me", "Paste Angel One / Upstox / Dhan partner URLs (fast revenue)"),
    ("Razorpay credit-pack checkout", "High", "Me + You", "Build checkout + create-order fn; live on your keys + deploy"),
    ("Capgo OTA setup", "Medium", "You", "CAPGO_TOKEN secret + CAPGO_ENABLED=true + one APK rebuild"),
    ("Signed store release builds", "Medium", "You", "Release APK/AAB + iOS provisioning + store listings/data-safety"),
    ("AdMob / AdSense IDs", "Medium", "You", "Production unit IDs + consent wiring"),
    ("Referral reward grant", "Medium", "Me", "Wire the referrer/referee credit grant (tables + page exist)"),
    ("Pro subscription (Phase D)", "Later", "Me + You", "Razorpay subscriptions + monthly credit grant"),
    ("Leaked-password protection", "Skipped", "—", "Supabase Pro-only feature; deferred"),
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

# Pending table
el.append(P("2. Pending for production launch", h1))
pdata = [[P("Item", hdr), P("Priority", hdr), P("Owner", hdr), P("Note", hdr)]]
for item, prio, owner, n in pending_rows:
    pdata.append([P(item, cellb), priority_cell(prio), P(owner, cell), P(n, cell)])
tp = Table(pdata, colWidths=[206, 70, 92, 418], repeatRows=1)
tps = [
    ("BACKGROUND", (0, 0), (-1, 0), GREEN_HDR),
    ("GRID", (0, 0), (-1, -1), 0.5, GREY),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]
for i in range(1, len(pdata)):
    if i % 2 == 0:
        tps.append(("BACKGROUND", (0, i), (-1, i), GREYL))
tp.setStyle(TableStyle(tps))
el.append(tp)

el.append(P("3. Comparison with peers", h1))
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
