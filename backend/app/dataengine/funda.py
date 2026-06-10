"""Fundamental data ingestion (Phase 1) — BSE financial results, shareholding,
and corporate announcements, keyed by BSE scrip code.

This runs on a slower cadence than the EOD price spine (the exchanges publish
results/shareholding quarterly). Each symbol is fetched at most weekly and the
raw source JSON is stashed alongside the parsed columns, so nothing is lost when
a field mapping is imperfect — and the AI report can fall back to `raw`.

⚠️ The BSE corporate-API response shapes drift and aren't officially documented.
Validate them on the VM before trusting the parsers:

    python -m backend.app.dataengine.run funda-probe RELIANCE

That prints the raw JSON for one symbol so the parsers below can be tuned to the
live shape. Everything fails soft (per-symbol try/except) so a shape change or a
rate-limit never breaks a nightly run.

SEBI note: this ingests only publicly-filed exchange data (results, shareholding,
filings). Earnings-call transcripts are intentionally NOT scraped here — they are
often copyrighted; a later phase will *summarize* them, never reproduce them.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, date, timedelta

from . import sources
from .config import (
    BSE_ANNOUNCEMENTS,
    BSE_FIN_RESULTS,
    BSE_HOME,
    BSE_SHAREHOLDING,
    FUNDA_MAX_AGE_DAYS,
    FUNDA_SLEEP,
)
from .db import init_db, session
from .ingest import log


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _iso(s: str | None) -> str | None:
    """Best-effort parse of the many date formats BSE returns -> ISO YYYY-MM-DD."""
    if not s:
        return None
    s = str(s).strip()
    # Already ISO-ish (e.g. "2025-03-31T00:00:00").
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    for fmt in ("%d %b %Y", "%d-%b-%Y", "%d/%m/%Y", "%d-%m-%Y", "%b %Y", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _json(url: str) -> object | None:
    text = sources._fetch_browser_json(url, BSE_HOME + "/")
    if not text:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _rows(data: object) -> list[dict]:
    """BSE wraps results as a list, or {"Table": [...]}, or {"data": [...]}"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("Table", "data", "Table1"):
            v = data.get(key)
            if isinstance(v, list):
                return v
    return []


# ---------- financial results (quarterly P&L) ----------
# Alias map: our column -> candidate BSE keys (tuned against live JSON on the VM).
_FIN_KEYS = {
    "revenue": ("Revenue", "TotalIncome", "NetSales", "Income", "Net_Sales", "Total_Income"),
    "other_income": ("OtherIncome", "Other_Income"),
    "expenses": ("TotalExpenses", "Expenditure", "Total_Expenses"),
    "interest": ("Interest", "FinanceCost", "Finance_Cost"),
    "depreciation": ("Depreciation",),
    "pbt": ("PBT", "ProfitBeforeTax", "Profit_Before_Tax"),
    "tax": ("Tax", "TaxExpense"),
    "net_profit": ("NetProfit", "PAT", "Profit_After_Tax", "Net_Profit", "ProfitLoss"),
    "eps": ("EPS", "BasicEPS", "Basic_EPS"),
}


def parse_financials(data: object) -> list[dict]:
    out: list[dict] = []
    for r in _rows(data):
        if not isinstance(r, dict):
            continue
        lower = {str(k).lower(): v for k, v in r.items()}
        period = None
        for k in ("result_date", "resultdate", "period", "periodend", "yreendt", "to_date", "quarter"):
            period = _iso(lower.get(k))
            if period:
                break
        if not period:
            continue
        rt = (str(lower.get("qtr") or lower.get("period_type") or "Q")).strip().upper()[:1] or "Q"
        cons = 1 if "con" in str(lower.get("resultType") or lower.get("type") or "").lower() else 0
        row = {"period_end": period, "period_type": rt if rt in ("Q", "H", "Y") else "Q",
               "consolidated": cons, "raw": json.dumps(r, separators=(",", ":"))}
        for col, aliases in _FIN_KEYS.items():
            val = None
            for a in aliases:
                if a.lower() in lower and lower[a.lower()] not in (None, "", "-"):
                    val = sources._num(str(lower[a.lower()]))
                    if val is not None:
                        break
            row[col] = val
        out.append(row)
    return out


def store_financials(conn, isin: str, rows: list[dict]) -> int:
    n = 0
    for r in rows:
        conn.execute(
            """INSERT INTO financials
               (isin, period_end, period_type, consolidated, revenue, other_income,
                expenses, ebitda, interest, depreciation, pbt, tax, net_profit, eps,
                raw, source, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(isin, period_end, period_type, consolidated) DO UPDATE SET
                 revenue=excluded.revenue, other_income=excluded.other_income,
                 expenses=excluded.expenses, interest=excluded.interest,
                 depreciation=excluded.depreciation, pbt=excluded.pbt, tax=excluded.tax,
                 net_profit=excluded.net_profit, eps=excluded.eps, raw=excluded.raw,
                 updated_at=excluded.updated_at""",
            (isin, r["period_end"], r["period_type"], r["consolidated"],
             r.get("revenue"), r.get("other_income"), r.get("expenses"), None,
             r.get("interest"), r.get("depreciation"), r.get("pbt"), r.get("tax"),
             r.get("net_profit"), r.get("eps"), r.get("raw"), "BSE", _now()),
        )
        n += 1
    return n


# ---------- shareholding (promoter / pledge / FII / DII) ----------
def parse_shareholding(data: object) -> list[dict]:
    out: list[dict] = []
    for r in _rows(data):
        if not isinstance(r, dict):
            continue
        lower = {str(k).lower(): v for k, v in r.items()}
        period = None
        for k in ("qtr_end", "quarter", "qtrid", "period", "as_on", "date"):
            period = _iso(lower.get(k))
            if period:
                break
        if not period:
            continue

        def g(*aliases):
            for a in aliases:
                if a.lower() in lower and lower[a.lower()] not in (None, "", "-"):
                    v = sources._num(str(lower[a.lower()]))
                    if v is not None:
                        return v
            return None

        out.append({
            "period_end": period,
            "promoter_pct": g("promoter", "promoterpct", "promoter_holding", "totalpromoter"),
            "promoter_pledge_pct": g("pledge", "pledgepct", "promoterpledge", "encumbered"),
            "public_pct": g("public", "publicpct", "publicholding"),
            "fii_pct": g("fii", "fiipct", "foreign"),
            "dii_pct": g("dii", "diipct", "institution"),
            "raw": json.dumps(r, separators=(",", ":")),
        })
    return out


def store_shareholding(conn, isin: str, rows: list[dict]) -> int:
    n = 0
    for r in rows:
        conn.execute(
            """INSERT INTO shareholding
               (isin, period_end, promoter_pct, promoter_pledge_pct, public_pct,
                fii_pct, dii_pct, raw, source, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(isin, period_end) DO UPDATE SET
                 promoter_pct=excluded.promoter_pct,
                 promoter_pledge_pct=excluded.promoter_pledge_pct,
                 public_pct=excluded.public_pct, fii_pct=excluded.fii_pct,
                 dii_pct=excluded.dii_pct, raw=excluded.raw, updated_at=excluded.updated_at""",
            (isin, r["period_end"], r.get("promoter_pct"), r.get("promoter_pledge_pct"),
             r.get("public_pct"), r.get("fii_pct"), r.get("dii_pct"), r.get("raw"), "BSE", _now()),
        )
        n += 1
    return n


# ---------- announcements / filings (order wins, results, board meetings) ----------
def parse_announcements(data: object) -> list[dict]:
    out: list[dict] = []
    for r in _rows(data):
        if not isinstance(r, dict):
            continue
        lower = {str(k).lower(): v for k, v in r.items()}
        head = lower.get("newssub") or lower.get("headline") or lower.get("news_subject") or lower.get("subject")
        dt = lower.get("news_dt") or lower.get("dt_tm") or lower.get("dissemdt") or lower.get("date")
        if not head or not dt:
            continue
        out.append({
            "dt": str(dt)[:19],
            "category": (lower.get("category") or lower.get("cat") or None),
            "headline": str(head).strip()[:400],
            "url": (lower.get("attachmentname") or lower.get("url") or None),
        })
    return out


def store_announcements(conn, isin: str, rows: list[dict]) -> int:
    n = 0
    for r in rows:
        conn.execute(
            """INSERT INTO announcements (isin, dt, category, headline, url, source)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(isin, dt, headline) DO NOTHING""",
            (isin, r["dt"], r.get("category"), r["headline"], r.get("url"), "BSE"),
        )
        n += 1
    return n


# ---------- per-symbol fetch ----------
def fetch_one(conn, isin: str, bse_code: str) -> dict:
    """Fetch + store all Phase-1 fundamentals for one BSE scrip. Fails soft."""
    res = {"fin": 0, "shp": 0, "ann": 0}
    try:
        res["fin"] = store_financials(conn, isin, parse_financials(_json(BSE_FIN_RESULTS.format(code=bse_code))))
    except Exception as e:
        log(f"  funda fin {bse_code} FAIL {type(e).__name__}: {e}")
    try:
        res["shp"] = store_shareholding(conn, isin, parse_shareholding(_json(BSE_SHAREHOLDING.format(code=bse_code))))
    except Exception as e:
        log(f"  funda shp {bse_code} FAIL {type(e).__name__}: {e}")
    try:
        frm = (date.today() - timedelta(days=120)).strftime("%Y%m%d")
        to = date.today().strftime("%Y%m%d")
        url = BSE_ANNOUNCEMENTS.format(code=bse_code, frm=frm, to=to)
        res["ann"] = store_announcements(conn, isin, parse_announcements(_json(url)))
    except Exception as e:
        log(f"  funda ann {bse_code} FAIL {type(e).__name__}: {e}")
    conn.execute(
        "INSERT INTO funda_runs (isin, fetched_at, status) VALUES (?,?,?) "
        "ON CONFLICT(isin) DO UPDATE SET fetched_at=excluded.fetched_at, status=excluded.status",
        (isin, _now(), "ok"),
    )
    return res


def update_bse_codes() -> int:
    """Backfill securities.bse_code from the BSE ListofScripData feed (by ISIN).
    The BSE fundamentals APIs need this numeric scrip code; the NSE-sourced master
    never sets it. Run once before fetching fundamentals."""
    codes = sources.bse_scrip_codes()
    if not codes:
        log("  funda: BSE ListofScripData returned no scrip codes")
        return 0
    n = 0
    with session() as conn:
        for isin, code in codes.items():
            cur = conn.execute(
                "UPDATE securities SET bse_code=? "
                "WHERE isin=? AND (bse_code IS NULL OR bse_code='')",
                (code, isin),
            )
            n += cur.rowcount
    log(f"  funda: backfilled bse_code for {n} securities")
    return n


def _due(conn, limit: int | None, max_age_days: int, refresh_all: bool) -> list[tuple[str, str]]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).astimezone().isoformat()
    if refresh_all:
        q = ("SELECT s.isin, s.bse_code FROM securities s "
             "WHERE s.active=1 AND s.bse_code IS NOT NULL AND s.bse_code != '' "
             "ORDER BY s.shares_outstanding IS NULL, s.shares_outstanding DESC")
        params: tuple = ()
    else:
        q = ("SELECT s.isin, s.bse_code FROM securities s "
             "LEFT JOIN funda_runs f ON f.isin = s.isin "
             "WHERE s.active=1 AND s.bse_code IS NOT NULL AND s.bse_code != '' "
             "AND (f.fetched_at IS NULL OR f.fetched_at < ?) "
             "ORDER BY s.shares_outstanding IS NULL, s.shares_outstanding DESC")
        params = (cutoff,)
    rows = conn.execute(q, params).fetchall()
    out = [(r["isin"], str(r["bse_code"])) for r in rows]
    return out[:limit] if limit else out


def update_fundamentals(limit: int | None = None, max_age_days: int = FUNDA_MAX_AGE_DAYS,
                        refresh_all: bool = False) -> dict:
    """Fetch fundamentals for securities that are due (largest first). Resumable:
    re-running picks up where it left off via funda_runs."""
    import time
    init_db()
    update_bse_codes()
    with session() as conn:
        due = _due(conn, limit, max_age_days, refresh_all)
        log(f"FUNDA start  due={len(due)} (limit={limit}, max_age={max_age_days}d)")
        tot = {"symbols": 0, "fin": 0, "shp": 0, "ann": 0}
        for isin, code in due:
            r = fetch_one(conn, isin, code)
            tot["symbols"] += 1
            tot["fin"] += r["fin"]; tot["shp"] += r["shp"]; tot["ann"] += r["ann"]
            conn.commit()
            time.sleep(FUNDA_SLEEP)
        log(f"FUNDA done   symbols={tot['symbols']} fin={tot['fin']} shp={tot['shp']} ann={tot['ann']}")
    return tot


def _quick_json(url: str, timeout: int = 22) -> object | None:
    """Fast single-attempt Chrome-impersonated GET for the probe. Does NOT follow
    redirects, so a wrong path fails instantly and reveals its redirect target
    (instead of looping 30 times) — and a real endpoint answers in one hop."""
    try:
        from curl_cffi import requests as cffi
        r = cffi.get(url, impersonate="chrome", timeout=timeout, allow_redirects=False,
                     headers={"Referer": BSE_HOME + "/", "Accept": "application/json, text/plain, */*"})
        if 300 <= r.status_code < 400:
            return {"_redirect": (r.headers.get("location") or "")[:120], "_status": r.status_code}
        if r.status_code == 200 and r.content:
            try:
                return json.loads(r.text)
            except (json.JSONDecodeError, ValueError):
                return {"_non_json_head": r.text[:200]}
        return {"_http_status": r.status_code}
    except Exception as e:
        return {"_error": f"{type(e).__name__}: {str(e)[:90]}"}


def _resolve_code(conn, symbol_or_code: str) -> tuple[str, str, str] | None:
    row = conn.execute(
        "SELECT isin, name, bse_code FROM securities "
        "WHERE bse_code = ? OR nse_symbol = ? OR bse_symbol = ? LIMIT 1",
        (symbol_or_code, symbol_or_code.upper(), symbol_or_code.upper()),
    ).fetchone()
    if row and row["bse_code"]:
        return (str(row["bse_code"]), row["name"], row["isin"])
    return None


def probe(symbol_or_code: str) -> None:
    """Print the RAW BSE responses for one symbol/scrip so the parsers can be
    tuned to the live JSON shape. Fast: only refetches the scrip list if the
    code isn't cached yet."""
    init_db()
    with session() as conn:
        found = _resolve_code(conn, symbol_or_code)
    if not found:
        print("bse_code not cached — backfilling from BSE scrip list (one-time)…")
        update_bse_codes()
        with session() as conn:
            found = _resolve_code(conn, symbol_or_code)
    if not found:
        print(f"no BSE scrip code found for {symbol_or_code!r}")
        return
    code, name, isin = found
    print(f"== {name} (BSE {code}, {isin}) ==")
    frm = (date.today() - timedelta(days=120)).strftime("%Y%m%d")
    to = date.today().strftime("%Y%m%d")
    B = "https://api.bseindia.com/BseIndiaAPI/api/"
    candidates = {
        "FINANCIALS": [
            f"{B}Comp_FinancialResultData/w?scripcode={code}&seriesid=",
            f"{B}getRequestForFinancials/w?scripcode={code}",
            f"{B}Financial_Data/w?scripcode={code}&seriesid=",
            f"{B}Comp_FinancialResult/w?scripcode={code}",
            f"{B}FinancialResult/w?scripcode={code}",
            f"{B}DebtData/w?scripcode={code}",
        ],
        "SHAREHOLDING": [
            f"{B}ComShpPromoterNGroup/w?scripcode={code}&qtrid=0&Flag=PromoterNGroup",
            f"{B}ComShpPromoterNGroup/w?Scripcode={code}&qtrid=0",
            f"{B}ComShpPromoterNGroupTable/w?scripcode={code}&qtrid=0",
            f"{B}Shareholding/w?scripcode={code}",
            f"{B}GetShareHoldingData/w?scripcode={code}",
        ],
        "ANNOUNCEMENTS": [
            f"{B}AnnGetData/w?pageno=1&strCat=-1&strPrevDate={frm}&strToDate={to}&strScrip={code}&strType=C&strSearch=P",
            f"{B}AnnGetData/w?strCat=-1&strPrevDate={frm}&strToDate={to}&strScrip={code}&strType=C",
            f"{B}AnnGetData/w?strScrip={code}&strType=C&strCat=-1&strPrevDate={frm}&strToDate={to}",
        ],
    }
    for label, urls in candidates.items():
        print(f"\n=== {label} ===")
        for url in urls:
            tail = url.split("/api/", 1)[1][:80]
            data = _quick_json(url)
            if isinstance(data, str):
                print(f"  STRING {data[:60]!r}  {tail}")
                continue
            if isinstance(data, dict) and any(k in data for k in ("_error", "_http_status", "_non_json_head", "_redirect")):
                print(f"  [skip] {tail}  -> {json.dumps(data)[:140]}")
                continue
            rows = _rows(data)
            wrap = list(data.keys())[:8] if isinstance(data, dict) else f"list[{len(data)}]"
            print(f"  rows={len(rows)}  {tail}  wrap={wrap}")
            if rows and isinstance(rows[0], dict):
                print(f"    KEYS: {list(rows[0].keys())}")
                print(f"    SAMPLE: {json.dumps(rows[0])[:700]}")
                break  # winner for this dataset; stop trying others
