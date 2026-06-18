#!/usr/bin/env python3
"""Generate TaurEye-CFO-Review.pdf — a CFO review of all input costs and revenue
models, unit economics, break-even, and the cost-down / revenue-up plan."""
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
OUT = str(ROOT / "TaurEye-CFO-Review.pdf")

REG, BOLD = "Helvetica", "Helvetica-Bold"
dj = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
djb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if os.path.exists(dj) and os.path.exists(djb):
    pdfmetrics.registerFont(TTFont("DJ", dj)); pdfmetrics.registerFont(TTFont("DJB", djb))
    REG, BOLD = "DJ", "DJB"

GREEN = colors.HexColor("#0F9D63"); GREEN_HDR = colors.HexColor("#128F63")
DARK = colors.HexColor("#11141a"); MUT = colors.HexColor("#566270")
GREY = colors.HexColor("#E2E6EA"); GREYL = colors.HexColor("#F5F7F9")
RED = colors.HexColor("#C0392B")

h0 = ParagraphStyle("h0", fontName=BOLD, fontSize=22, leading=26, textColor=DARK, spaceAfter=2)
hsub = ParagraphStyle("hsub", fontName=REG, fontSize=10, textColor=MUT, spaceAfter=4)
h1 = ParagraphStyle("h1", fontName=BOLD, fontSize=13.5, textColor=GREEN_HDR, spaceBefore=13, spaceAfter=5)
h2 = ParagraphStyle("h2", fontName=BOLD, fontSize=10.5, textColor=DARK, spaceBefore=7, spaceAfter=2)
body = ParagraphStyle("body", fontName=REG, fontSize=9.5, leading=13.5, textColor=DARK, spaceAfter=5)
bullet = ParagraphStyle("bullet", fontName=REG, fontSize=9.5, leading=13, textColor=DARK)
cell = ParagraphStyle("cell", fontName=REG, fontSize=8.6, leading=11, textColor=DARK)
cellb = ParagraphStyle("cellb", fontName=BOLD, fontSize=8.6, leading=11, textColor=DARK)
cellg = ParagraphStyle("cellg", fontName=BOLD, fontSize=8.6, leading=11, textColor=GREEN)
cellr = ParagraphStyle("cellr", fontName=BOLD, fontSize=8.6, leading=11, textColor=RED)
hdr = ParagraphStyle("hdr", fontName=BOLD, fontSize=8.6, leading=11, textColor=colors.white)
small = ParagraphStyle("small", fontName=REG, fontSize=8, leading=10.5, textColor=MUT, spaceBefore=2)

def P(t, st=body): return Paragraph(t, st)
def blist(items):
    return ListFlowable([ListItem(Paragraph(i, bullet), leftIndent=10, value="•") for i in items],
                        bulletType="bullet", bulletColor=GREEN, leftIndent=8, spaceAfter=5, bulletFontSize=8)
def rule(): return HRFlowable(width="100%", thickness=0.6, color=GREY, spaceBefore=3, spaceAfter=7)
def table(data, widths, aligns=None):
    t = Table(data, colWidths=widths, repeatRows=1)
    ts = [("BACKGROUND",(0,0),(-1,0),GREEN_HDR),("GRID",(0,0),(-1,-1),0.5,GREY),
          ("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),4),
          ("BOTTOMPADDING",(0,0),(-1,-1),4),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5)]
    for i in range(1,len(data)):
        if i % 2 == 0: ts.append(("BACKGROUND",(0,i),(-1,i),GREYL))
    t.setStyle(TableStyle(ts)); return t

el = []
el.append(P("TaurEye — CFO Financial Review", h0))
el.append(P("All-in input costs, revenue models, unit economics &amp; break-even, and the margin plan · "
            "Indicative figures (verify vendor pricing) · $1 = ₹88", hsub))
el.append(rule())

# 1. Exec summary
el.append(P("1. Executive summary", h1))
el.append(P("TaurEye is an <b>ad-subsidised freemium</b> EOD stock app. The cost base is unusually light because "
            "the product is static and compute runs client-side — the <b>only material variable cost is the LLM</b> "
            "(AI analysis/reports), and the dominant revenue is <b>advertising</b>, topped up by credit purchases, "
            "broker affiliate and a future Pro subscription.", body))
el.append(P("Against a 1M-user base (mix: 10% light / 15% medium / 5% heavy / 70% dormant) the model lands at "
            "<b>break-even ≈ 4% paying conversion</b>, and is <b>marginally profitable (≈ +₹1.76L/month)</b> once "
            "free reports are gated behind a rewarded ad. The plan below widens that margin and removes the "
            "single-stream ad dependency.", body))
el.append(P("<b>CFO verdict:</b> viable at launch; margin <i>improves</i> with scale if we (a) cache AI output, "
            "(b) monetise free reports with rewarded ads, (c) switch on broker affiliate now, and (d) diversify off ads.", h2))

# 2. Input cost structure
el.append(P("2. Input cost structure (all tools)", h1))
el.append(P("<b>Free at scale</b> (if architected right): Oracle VM (Always-Free), Cloudflare CDN (free), "
            "GitHub Actions (public repo), FCM push, NSE/BSE data, self-hosted Capgo OTA.", body))
cost_rows = [
    ("Item", "Type", "Trigger", "Cost (at scale)"),
    ("LLM — Anthropic (Haiku)", "COGS / usage", "per AI report (~₹0.70)", "₹0.35L–₹10.5Cr/mo*"),
    ("Supabase Pro", "Infra / time+usage", "always-on, MAU, backups", "$25 base → ~₹3.0–3.7L/mo @1M MAU"),
    ("Apple Developer", "Distribution / time", "annual, iOS publish", "$99/yr (~₹700/mo)"),
    ("Google Play", "Distribution / one-time", "Android publish", "$25 once"),
    ("Domain", "Infra / time", "annual renewal", "~₹100/mo"),
    ("SMTP (auth email)", "Infra / usage", "signup/reset volume", "~₹1,500/mo"),
    ("Razorpay", "Payments / per-txn", "on credit sales", "~2% + 18% GST"),
    ("Capgo OTA", "Distribution / usage", "MAU (or self-host)", "₹0 self-hosted"),
    ("Monitoring (optional)", "Ops / usage", "event volume", "₹0–8k/mo"),
    ("Kite Connect (future)", "Feature / time", "only if live broker sync", "₹500/mo"),
]
data = [[P(c, hdr) for c in cost_rows[0]]]
for a,b,c,d in cost_rows[1:]:
    data.append([P(a, cellb), P(b, cell), P(c, cell), P(d, cellb)])
el.append(table(data, [150, 92, 138, 132]))
el.append(P("*LLM is the swing item — ₹0.35L/mo (light) to ₹10.5Cr/mo (every user 5 reports/day). <b>Caching caps "
            "it at ~₹2.4L/mo total, independent of user count</b> (see §5). <b>Fixed infra opex ≈ ₹3.5L/mo</b>, ~95% Supabase.", small))

# 3. Revenue models
el.append(P("3. Revenue models", h1))
rev_rows = [
    ("Stream", "Mechanism", "Rate (conservative)", "Role"),
    ("Banner ads", "Free users only", "eCPM ~₹12 → ARPU ~₹8.7/free user/mo", "~55% of revenue"),
    ("Rewarded ads", "1 ad per free report", "eCPM ~₹80 → ₹0.08/report", "Monetises free-AI bleed"),
    ("Interstitial ads", "Between screens", "eCPM ~₹50", "Incremental"),
    ("Credit packs", "Razorpay (Phase C)", "₹99→100, ₹299→350, ₹599→750 cr", "High-intent paywall"),
    ("Broker affiliate", "Demat signups", "₹300–500 / account", "Near-100% margin, fastest"),
    ("Pro subscription", "Phase D", "₹999/yr (ad-free + AI quota)", "Highest LTV, recurring"),
]
data = [[P(c, hdr) for c in rev_rows[0]]]
for a,b,c,d in rev_rows[1:]:
    data.append([P(a, cellb), P(b, cell), P(c, cell), P(d, cell)])
el.append(table(data, [96, 120, 180, 116]))
el.append(P("<b>Per paid report:</b> charge 5 credits (~₹4.25) vs ~₹0.70 LLM = ~<b>84% margin</b> (→ ~99% with caching). "
            "<b>Broker affiliate</b> at 3% of 1M users ≈ <b>₹1.2 Cr one-time</b> — currently un-wired (money left on table).", small))

# 4. Unit economics base case
el.append(P("4. Unit economics — base case (1M users)", h1))
ue_rows = [
    ("Monthly P&L (base mix, rewarded-gated)", "₹ / month"),
    ("Report revenue (paid)", "₹12.75 L"),
    ("Banner ads (free users)", "₹25.88 L"),
    ("Rewarded ads (5M free reports)", "₹4.00 L"),
    ("Total revenue", "₹42.63 L"),
    ("LLM cost (before caching)", "(₹37.10 L)"),
    ("Fixed infra", "(₹3.52 L)"),
    ("Payment fees", "(₹0.26 L)"),
    ("NET", "+₹1.76 L  (+₹21.1 L/yr)"),
    ("Break-even paying conversion", "≈ 4.1%"),
]
data = [[P(ue_rows[0][0], hdr), P(ue_rows[0][1], hdr)]]
for a,b in ue_rows[1:]:
    stylv = cellg if ("+" in b or "Total revenue" in a) else (cellr if "(" in b else cellb)
    data.append([P(a, cellb if a in ("Total revenue","NET","Break-even paying conversion") else cell), P(b, stylv)])
el.append(table(data, [300, 212]))
el.append(P("Without rewarded-gating the same base case is <b>−₹2.0L/mo</b> (break-even ~6%). The rewarded ad on each "
            "free report is what flips it positive. Model is configurable in docs/unit-economics.html.", small))

# 4b. Pro-forma after the plan
el.append(P("5. Pro-forma — after the cost-down / revenue-up plan", h1))
el.append(P("Same 1M-user base, with the plan implemented: AI output cached (LLM decouples from scale), broker "
            "affiliate live, Pro at 1% penetration (₹999/yr, ad-free), and ad mediation lifting eCPMs.", body))
pf_rows = [
    ("Monthly P&L line", "Base case", "After plan"),
    ("Report revenue (paid)", "₹12.75 L", "₹12.75 L"),
    ("Banner ads (free users)", "₹25.88 L", "₹31.63 L"),
    ("Rewarded ads", "₹4.00 L", "₹5.00 L"),
    ("Interstitial ads", "—", "₹3.00 L"),
    ("Broker affiliate", "—", "₹5.00 L"),
    ("Pro subscriptions (1%)", "—", "₹8.33 L"),
    ("TOTAL REVENUE", "₹42.63 L", "₹65.70 L"),
    ("LLM cost", "(₹37.10 L)", "(₹2.40 L)  cached"),
    ("Fixed infra", "(₹3.52 L)", "(₹3.50 L)"),
    ("Payment fees", "(₹0.26 L)", "(₹0.42 L)"),
    ("NET / month", "+₹1.76 L", "+₹59.4 L"),
    ("NET / year", "+₹21.1 L", "+₹7.1 Cr"),
]
data = [[P(c, hdr) for c in pf_rows[0]]]
for a,b,c in pf_rows[1:]:
    emph = a in ("TOTAL REVENUE","NET / month","NET / year")
    av = cellb if emph else cell
    bv = cellr if "(" in b else (cellg if "+" in b or "TOTAL" in a else av)
    cv = cellr if "(" in c else (cellg if "+" in c or "TOTAL" in a else cellb)
    data.append([P(a, cellb if emph else cell), P(b, av), P(c, cv)])
el.append(table(data, [200, 156, 156]))
el.append(P("Swing drivers: <b>AI caching cuts LLM ₹37.1L → ₹2.4L (+₹34.7L to net)</b>; affiliate + Pro + ad uplift "
            "add ~₹23L revenue. Gross margin rises from ~13% to ~90% as the only real COGS collapses. Pro-forma — "
            "assumes the plan executes (caching shipped, 3% affiliate take-up over time, 1% Pro, eCPM uplift).", small))

# 5. Cost-down plan
el.append(P("6. Cost minimisation plan (ranked by impact)", h1))
el.append(blist([
    "<b>Cache AI output per stock, per day (₹0 to build, ~80% LLM cut).</b> Stock reports are factual + EOD — identical "
    "for all users that day. Generate once, serve to all, still charge a credit. LLM cost <b>decouples from user count</b> "
    "→ ceiling ~<b>₹2.4L/mo total</b>; margin 84% → ~99%. Pre-generate the top ~500 stocks in the nightly pipeline = ₹0 marginal.",
    "<b>Stop giving away the costly item.</b> Rewarded-ad-gate free reports; cut free allowance 30 → 5/mo; heavy AI = paid-only.",
    "<b>Hold fixed infra flat &amp; cheap.</b> Static + Oracle Always-Free + Cloudflare free + Supabase Pro ($25, not Team) + "
    "self-host Capgo. Prune auth audit logs + old ledger rows (pg_cron) to stay on cheap DB tiers far longer.",
    "<b>Defer paid tools</b> (Kite ₹500/mo, paid data feeds, smallcase) until revenue demands them.",
]))

# 6. Revenue-up plan
el.append(P("7. Revenue maximisation plan (ranked by ROI)", h1))
el.append(blist([
    "<b>Broker affiliate — today.</b> Paste Angel/Upstox/Dhan URLs. ₹300–500/signup; ~₹1.2 Cr one-time at 3% of 1M. Pure margin.",
    "<b>Optimise the ad stack.</b> Banner (free) + rewarded-per-report + interstitial; AdMob mediation + a 2nd network to lift eCPM 20–40%.",
    "<b>Credit packs (Razorpay).</b> Paywall at the high-intent moment (free reports exhausted → 'unlock full report'). 4% conversion funds the rest.",
    "<b>Pro subscription (₹999/yr).</b> Ad-free + AI quota + the institutional portfolio analytics already built — recurring, highest LTV.",
    "<b>Diversify:</b> drive affiliate + conversion + Pro so no single stream &gt; 50% of revenue (today it's dangerously ad-heavy).",
]))

# 7. 90-day plan
el.append(P("8. 90-day sequence", h1))
plan_rows = [
    ("Phase", "Actions", "Cost", "Impact"),
    ("0 — now", "Broker links · rewarded-gate AI · free=5 · AI caching · prune logs", "₹0", "Flips to profit; caps LLM; +₹1.2Cr affiliate ceiling"),
    ("1 — launch", "HTTPS+Cloudflare · Supabase Pro · Razorpay · ad mediation", "~₹3–4k/mo", "Unlocks paid revenue + reliability"),
    ("2 — scale", "Pro subscription · conversion paywalls · 2nd ad network", "dev time", "Recurring LTV; de-risk ads"),
]
data = [[P(c, hdr) for c in plan_rows[0]]]
for a,b,c,d in plan_rows[1:]:
    data.append([P(a, cellb), P(b, cell), P(c, cellb), P(d, cell)])
el.append(table(data, [62, 226, 70, 154]))

# 8. KPIs + risks
el.append(P("9. KPIs &amp; guardrails", h1))
el.append(P("Track monthly: gross margin/report · <b>LLM ₹/active user</b> · paying conversion % · ad ARPU (free user) · "
            "revenue concentration (no stream &gt;50%) · <b>CAC vs LTV (target ≥3:1)</b> · Supabase MAU · cash runway. "
            "<b>Hard guardrail:</b> never let credit price fall below LLM cost (the model flags this).", body))
el.append(P("10. Key risks", h1))
el.append(blist([
    "<b>Ad concentration + India's low/volatile eCPM</b> — one eCPM crash and the base case goes negative.",
    "<b>Conversion is unproven</b> — 0 paying users today; the whole plan rides on reaching ~4%.",
    "<b>LLM price moves</b> — mitigated heavily by caching.",
    "<b>Single-VM / Oracle reclamation</b> holding user money; and <b>SEBI / GST</b> exposure as revenue starts.",
]))

# Appendix A — Zero-cost bootstrap mode
el.append(P("Appendix A — ₹0 Bootstrap Mode", h1))
el.append(P("Truly ₹0 is achievable on <b>cash</b> — paid for in founder time, feature/quality compromises, and "
            "scaling ceilings. The method: max free tiers, self-host the rest on the Always-Free VM, and kill the "
            "<b>only real COGS (the LLM)</b>. Use this to launch &amp; validate, then graduate to the paid stack once "
            "revenue covers it.", body))
zero_rows = [
    ("Cost today", "₹0 replacement", "Trade-off"),
    ("LLM (Anthropic)", "Templated/rule-based analysis from existing metrics &amp; patterns; or a free-tier LLM (Gemini / Groq / Cloudflare Workers AI) with caps", "No frontier AI; free LLM is rate-limited"),
    ("Supabase Pro ($25)", "Free tier + a free daily cron pinger to dodge the 7-day pause", "500MB / 50k MAU cap; no backups"),
    ("Domain + TLS", "Cloudflare Pages → free *.pages.dev + HTTPS + CDN", "Unbranded URL (also fixes HTTP + single-VM SPOF)"),
    ("VM serving", "VM runs pipeline only; bundle → Cloudflare R2 free (10GB, zero egress)", "Static-only on the free host"),
    ("Apple $99 + Play $25", "PWA (manifest already shipped) — install to home screen", "No store discovery; iOS push limited; APK via F-Droid/sideload"),
    ("SMTP", "Supabase built-in / Brevo free (300/day) / Resend free (3k/mo)", "Rate-limited at scale"),
    ("Razorpay / FCM / CI / monitoring", "Per-txn only · FCM free · public-repo Actions · Uptime Kuma self-host / Sentry free", "—"),
]
data = [[P(c, hdr) for c in zero_rows[0]]]
for a,b,c in zero_rows[1:]:
    data.append([P(a, cellb), P(b, cell), P(c, cell)])
el.append(table(data, [110, 230, 172]))
el.append(P("<b>Result: ₹0 recurring cash</b> = Always-Free VM (pipeline) + Cloudflare Pages/R2 (frontend) + "
            "Supabase free + templated/free-tier AI.", body))

el.append(P("Making AI ₹0 (pick one)", h2))
el.append(blist([
    "<b>Templated analysis (truly ₹0, recommended):</b> generate the report deterministically from metrics you already compute. No tokens, no limits.",
    "<b>Free-tier LLM (₹0, capped):</b> route AI through Gemini/Groq/Cloudflare Workers AI free quotas, N calls/user/day. Real LLM, rate-limited, quality &lt; Claude.",
    "<b>Hybrid:</b> templated by default + one free 'AI polish' call/user/day.",
]))
el.append(P("₹0-cost revenue (bootstrap still earns)", h2))
el.append(blist([
    "<b>Ads</b> — AdSense (PWA/web) / AdMob (APK): zero cost, pure profit.",
    "<b>Broker affiliate</b> — ₹300–500/demat signup, near-100% margin. Switch on day one.",
    "Skip credits/Razorpay initially (complexity + per-txn fee) — monetise on ads + affiliate while validating.",
]))
el.append(P("CFO caveats — what ₹0 actually costs", h2))
el.append(blist([
    "<b>Founder time</b> (the real bill): self-host + ops ≈ hours/week.",
    "<b>Reliability/DR:</b> Always-Free reclamation + no backups = you own the risk.",
    "<b>Ceilings:</b> free tiers cap ~thousands of active users / 500MB before you must pay.",
    "<b>Brand/trust:</b> *.pages.dev + PWA + templated AI look less premium.",
    "<b>Still not zero if you earn:</b> GST registration + basic legal are unavoidable (regulatory, not tooling).",
]))
el.append(P("<b>Recommendation:</b> bootstrap to product-market fit on ₹0 (Cloudflare Pages + Supabase free + "
            "templated AI + ads/affiliate); the moment revenue clears ~₹5k/mo, graduate to branded domain → "
            "Supabase Pro → cached Claude. Spend <i>earned</i> money on the premium stack, not pre-revenue cash.", body))

el.append(rule())
el.append(P("Prepared as an internal CFO review. Figures are indicative planning estimates at conservative assumptions; "
            "verify current vendor pricing and validate conversion/eCPM with live data before committing spend.", small))

SimpleDocTemplate(OUT, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm,
                  topMargin=13*mm, bottomMargin=12*mm, title="TaurEye — CFO Financial Review").build(el)
print("WROTE", OUT)
