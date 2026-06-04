"""Configuration for the EOD data engine — source URLs, paths, tolerances.

URLs are kept here (not buried in code) because the exchanges periodically move
their archive paths. If a download starts 404-ing, update the template here.
All URL templates use {d}=DD, {m}=MM, {Y}=YYYY, {y}=YY, {ymd}=YYYYMMDD,
{dmy}=DDMMYYYY, {DMon}=DDMonYYYY (e.g. 30May2026).
"""
from __future__ import annotations

import os
from pathlib import Path

# ---- storage ----
ENGINE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("TAUREYE_DATA_DIR", ENGINE_DIR.parent.parent / "data"))
DB_PATH = Path(os.getenv("TAUREYE_DB_PATH", DATA_DIR / "market.db"))
CACHE_DIR = DATA_DIR / "raw"          # raw downloaded files, kept for audit/replay
LOG_PATH = Path(os.getenv("TAUREYE_LOG_PATH", DATA_DIR / "engine.log"))

# ---- HTTP ----
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
HTTP_TIMEOUT = 30          # seconds per request
HTTP_RETRIES = 4
HTTP_BACKOFF = 1.6         # exponential backoff base (seconds)

# ---- reconciliation ----
# Max relative disagreement (fraction) on a shared field before a row is
# quarantined instead of trusted. 0.005 = 0.5%.
RECON_TOLERANCE_PCT = 0.005
# Absolute floor so penny-stock rounding doesn't trip the percentage check.
RECON_TOLERANCE_ABS = 0.05

# ---- source URL templates (OFFICIAL exchange archives) ----
# NSE — current UDiFF "common equity" bhavcopy (zip of one CSV).
NSE_BHAV_UDIFF = (
    "https://nsearchives.nseindia.com/content/cm/"
    "BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip"
)
# NSE — legacy "security bhavdata full" (plain CSV, includes deliverables).
NSE_BHAV_LEGACY = (
    "https://nsearchives.nseindia.com/products/content/"
    "sec_bhavdata_full_{dmy}.csv"
)
# NSE — canonical list of all EQ-series equities (security master).
NSE_EQUITY_LIST = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
# NSE — list of all listed ETFs (used to classify the ETF segment by ISIN).
NSE_ETF_LIST = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv"
# NSE — corporate actions feed (JSON; needs cookie priming via the homepage).
# IMPORTANT: called WITHOUT a date range, this endpoint returns only the handful
# of UPCOMING actions (~next week), so historical splits/bonuses across our price
# history are missed and adjusted prices stay wrong. We must pass from_date/to_date
# (DD-MM-YYYY) spanning the full history window to capture past corporate actions.
NSE_HOME = "https://www.nseindia.com"
NSE_CORP_ACTIONS = (
    "https://www.nseindia.com/api/corporates-corporateActions?index=equities"
    "&from_date={frm}&to_date={to}"
)
# The browser page that owns the corporate-actions API (used as Referer).
NSE_CORP_ACTIONS_PAGE = (
    "https://www.nseindia.com/companies-listing/corporate-filings-actions"
)
# NSE — per-symbol equity quote (JSON; needs cookie priming). We read
# securityInfo.issuedSize = number of issued shares, which times the close price
# gives an accurate market cap. {sym} is the NSE trading symbol (url-encoded).
NSE_QUOTE_EQUITY = "https://www.nseindia.com/api/quote-equity?symbol={sym}"
# The browser page that "owns" the quote API. NSE's WAF wants this as the Referer
# (and a visit to it warms the right cookies) or it answers the API with 401/403.
NSE_QUOTE_PAGE = "https://www.nseindia.com/get-quotes/equity?symbol={sym}"

# BSE — current UDiFF equity bhavcopy. NOTE: BSE serves this as a RAW .CSV
# (Content-Type: application/octet-stream), NOT a zip. The ".CSV.ZIP" path on
# www.bseindia.com returns the site's Angular shell (HTML), which is why earlier
# attempts saw a 12,565-byte "HTML error page". The raw .CSV carries ISIN + name
# in the same UDiFF layout as NSE, so the same parser handles it.
BSE_BHAV_UDIFF = (
    "https://www.bseindia.com/download/BhavCopy/Equity/"
    "BhavCopy_BSE_CM_0_0_0_{ymd}_F_0000.CSV"
)
# BSE — referer required by their CDN.
BSE_HOME = "https://www.bseindia.com"
# BSE — bulk "list of scrips" API. Returns the WHOLE active equity universe in a
# single JSON call, each row carrying ISIN_NUMBER + Mktcap (already in Rs CRORE).
# This is the real market-cap source: NSE's per-symbol quote API is hard-blocked
# by Akamai (validated _abck cookie), but this BSE endpoint has no bot wall and,
# because caps are keyed by ISIN, it covers NSE-listed names too (shared ISIN).
BSE_LIST_SCRIP = (
    "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w"
    "?Group=&Scripcode=&industry=&segment=Equity&status=Active"
)


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
