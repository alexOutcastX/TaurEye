"""EODHD vendor integration — licensed fundamentals + news for the AI report.

BSE's corporate APIs bot-wall datacenter IPs (proven via funda-probe), so deep
fundamentals come from EODHD (https://eodhd.com) instead:

  /api/fundamentals/<SYM>.NSE  -> General, Highlights, Financials (Income
                                  Statement, Balance Sheet, Cash Flow,
                                  quarterly + yearly), SharesStats, Holders
  /api/news?s=<SYM>.NSE        -> dated headlines with links

The API key is read from the EODHD_API_KEY environment variable — NEVER
hard-code or commit it. On the VM, export it in the cron/profile; from the
phone workflow it is injected from the GitHub secret.

Mapping into the spine (same tables the report exports from):
  Income Statement (quarterly) -> financials
  Balance Sheet   (quarterly) -> balance_sheets   (debt / equity / cash)
  SharesStats + Holders       -> shareholding     (insider≈promoter, institutions)
  News                        -> announcements

NOTE on plans: fundamentals on EODHD cost ~10 API-call credits per symbol and
need a plan that includes the Fundamentals feed for IN exchanges. `eodhd-probe`
tells you immediately whether the current key/plan serves the data (a 402/403
body is printed verbatim).
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone

from .config import FUNDA_MAX_AGE_DAYS
from .db import init_db, session
from .ingest import log

BASE = "https://eodhd.com/api"
# Fundamentals cost ~10 call-credits each on EODHD; pace conservatively.
SLEEP = 1.2


def _key() -> str | None:
    k = (os.getenv("EODHD_API_KEY") or "").strip()
    return k or None


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _get(url: str, timeout: int = 40) -> tuple[int, str]:
    """Plain GET (EODHD has no bot wall — ordinary requests are fine)."""
    import requests
    try:
        r = requests.get(url, timeout=timeout, headers={"Accept": "application/json"})
        return r.status_code, r.text
    except Exception as e:  # network error -> sentinel status
        return 0, f"{type(e).__name__}: {e}"


def _num(v) -> float | None:
    if v in (None, "", "NA", "None"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------- mapping helpers ----------
def map_income(fund: dict) -> list[dict]:
    """EODHD Financials.Income_Statement.quarterly -> financials rows."""
    out = []
    inc = ((fund.get("Financials") or {}).get("Income_Statement") or {})
    for ptype, branch in (("Q", "quarterly"), ("Y", "yearly")):
        for period, r in (inc.get(branch) or {}).items():
            if not isinstance(r, dict):
                continue
            out.append({
                "period_end": (r.get("date") or period)[:10],
                "period_type": ptype,
                "consolidated": 1,
                "revenue": _num(r.get("totalRevenue")),
                "other_income": _num(r.get("totalOtherIncomeExpenseNet")),
                "expenses": _num(r.get("totalOperatingExpenses")),
                "ebitda": _num(r.get("ebitda")),
                "interest": _num(r.get("interestExpense")),
                "depreciation": _num(r.get("depreciationAndAmortization")),
                "pbt": _num(r.get("incomeBeforeTax")),
                "tax": _num(r.get("incomeTaxExpense")),
                "net_profit": _num(r.get("netIncome")),
                "eps": None,  # EODHD keeps EPS under Earnings.History
                "raw": json.dumps(r, separators=(",", ":")),
            })
    # EPS from Earnings.History (epsActual, keyed by report date).
    eps_hist = ((fund.get("Earnings") or {}).get("History") or {})
    eps_by_date = {}
    for _, e in eps_hist.items():
        if isinstance(e, dict) and e.get("reportDate"):
            d = (e.get("date") or "")[:10]
            if d:
                eps_by_date[d] = _num(e.get("epsActual"))
    for row in out:
        if row["eps"] is None:
            row["eps"] = eps_by_date.get(row["period_end"])
    return out


def map_balance(fund: dict) -> list[dict]:
    """EODHD Financials.Balance_Sheet -> balance_sheets rows (debt analysis)."""
    out = []
    bs = ((fund.get("Financials") or {}).get("Balance_Sheet") or {})
    for ptype, branch in (("Q", "quarterly"), ("Y", "yearly")):
        for period, r in (bs.get(branch) or {}).items():
            if not isinstance(r, dict):
                continue
            cash = _num(r.get("cashAndEquivalents")) or _num(r.get("cash"))
            total_debt = _num(r.get("shortLongTermDebtTotal"))
            lt = _num(r.get("longTermDebtTotal")) or _num(r.get("longTermDebt"))
            st = _num(r.get("shortTermDebt"))
            if total_debt is None and (lt is not None or st is not None):
                total_debt = (lt or 0) + (st or 0)
            out.append({
                "period_end": (r.get("date") or period)[:10],
                "period_type": ptype,
                "total_assets": _num(r.get("totalAssets")),
                "total_liab": _num(r.get("totalLiab")),
                "total_debt": total_debt,
                "long_term_debt": lt,
                "short_term_debt": st,
                "cash": cash,
                "net_debt": _num(r.get("netDebt")),
                "equity": _num(r.get("totalStockholderEquity")),
                "net_working_capital": _num(r.get("netWorkingCapital")),
                "raw": json.dumps(r, separators=(",", ":")),
            })
    return out


def map_holding(fund: dict) -> list[dict]:
    """SharesStats -> a single latest shareholding snapshot.

    EODHD doesn't publish the Indian promoter/pledge breakup; PercentInsiders is
    the closest proxy for promoter holding and PercentInstitutions for FII+DII.
    The columns are nullable, so absent data simply stays NULL (never invented)."""
    ss = fund.get("SharesStats") or {}
    gen = fund.get("General") or {}
    upd = (gen.get("UpdatedAt") or _now())[:10]
    ins = _num(ss.get("PercentInsiders"))
    inst = _num(ss.get("PercentInstitutions"))
    if ins is None and inst is None:
        return []
    public = None
    if ins is not None and inst is not None:
        public = max(0.0, 100.0 - ins - inst)
    return [{
        "period_end": upd,
        "promoter_pct": ins,
        "promoter_pledge_pct": None,
        "public_pct": public,
        "fii_pct": None,
        "dii_pct": inst,  # institutions total (FII+DII not split by EODHD)
        "raw": json.dumps(ss, separators=(",", ":")),
    }]


def map_news(items: list) -> list[dict]:
    out = []
    for n in items or []:
        if not isinstance(n, dict) or not n.get("title"):
            continue
        out.append({
            "dt": (n.get("date") or "")[:19],
            "category": "News",
            "headline": str(n["title"]).strip()[:400],
            "url": n.get("link"),
        })
    return [n for n in out if n["dt"]]


# ---------- store (reuse funda's writers) ----------
def _store_all(conn, isin: str, fund: dict, news: list) -> dict:
    from . import funda
    res = {"fin": 0, "bs": 0, "shp": 0, "ann": 0}
    res["fin"] = funda.store_financials(conn, isin, map_income(fund))
    for r in map_balance(fund):
        conn.execute(
            """INSERT INTO balance_sheets
               (isin, period_end, period_type, total_assets, total_liab, total_debt,
                long_term_debt, short_term_debt, cash, net_debt, equity,
                net_working_capital, raw, source, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(isin, period_end, period_type) DO UPDATE SET
                 total_assets=excluded.total_assets, total_liab=excluded.total_liab,
                 total_debt=excluded.total_debt, long_term_debt=excluded.long_term_debt,
                 short_term_debt=excluded.short_term_debt, cash=excluded.cash,
                 net_debt=excluded.net_debt, equity=excluded.equity,
                 net_working_capital=excluded.net_working_capital,
                 raw=excluded.raw, updated_at=excluded.updated_at""",
            (isin, r["period_end"], r["period_type"], r["total_assets"], r["total_liab"],
             r["total_debt"], r["long_term_debt"], r["short_term_debt"], r["cash"],
             r["net_debt"], r["equity"], r["net_working_capital"], r["raw"],
             "EODHD", _now()),
        )
        res["bs"] += 1
    res["shp"] = funda.store_shareholding(conn, isin, map_holding(fund))
    res["ann"] = funda.store_announcements(conn, isin, map_news(news))
    return res


# ---------- fetch ----------
def fetch_symbol(conn, isin: str, nse_symbol: str, key: str) -> dict | None:
    sym = f"{nse_symbol}.NSE"
    code, body = _get(f"{BASE}/fundamentals/{sym}?api_token={key}&fmt=json")
    if code != 200:
        log(f"  eodhd {sym} fundamentals HTTP {code}: {body[:120]}")
        return None
    try:
        fund = json.loads(body)
    except ValueError:
        log(f"  eodhd {sym} non-JSON fundamentals: {body[:120]}")
        return None
    ncode, nbody = _get(f"{BASE}/news?s={sym}&limit=30&api_token={key}&fmt=json")
    news = []
    if ncode == 200:
        try:
            news = json.loads(nbody)
        except ValueError:
            pass
    # Company profile -> securities.about (shown in the report's About section).
    if isinstance(fund, dict):
        desc = ((fund.get("General") or {}).get("Description") or "").strip()
        if desc:
            conn.execute("UPDATE securities SET about=? WHERE isin=?", (desc[:2000], isin))
    res = _store_all(conn, isin, fund if isinstance(fund, dict) else {}, news)
    conn.execute(
        "INSERT INTO funda_runs (isin, fetched_at, status) VALUES (?,?,?) "
        "ON CONFLICT(isin) DO UPDATE SET fetched_at=excluded.fetched_at, status=excluded.status",
        (isin, _now(), "eodhd"),
    )
    return res


def update(limit: int | None = None, max_age_days: int = FUNDA_MAX_AGE_DAYS) -> dict:
    """Fetch EODHD fundamentals+news for due NSE-listed securities, largest first.
    Resumable via funda_runs; respects the daily API quota by just stopping on
    repeated auth/quota errors."""
    key = _key()
    if not key:
        return {"error": "EODHD_API_KEY not set"}
    init_db()
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).astimezone().isoformat()
    tot = {"symbols": 0, "fin": 0, "bs": 0, "shp": 0, "ann": 0, "failed": 0}
    with session() as conn:
        rows = conn.execute(
            "SELECT s.isin, s.nse_symbol FROM securities s "
            "LEFT JOIN funda_runs f ON f.isin = s.isin "
            "WHERE s.active=1 AND s.nse_symbol IS NOT NULL AND s.nse_symbol != '' "
            "AND (f.fetched_at IS NULL OR f.fetched_at < ?) "
            "ORDER BY s.shares_outstanding IS NULL, s.shares_outstanding DESC",
            (cutoff,),
        ).fetchall()
        due = [(r["isin"], r["nse_symbol"]) for r in rows][: (limit or len(rows))]
        log(f"EODHD start  due={len(due)}")
        fails_in_row = 0
        for isin, sym in due:
            res = fetch_symbol(conn, isin, sym, key)
            if res is None:
                tot["failed"] += 1
                fails_in_row += 1
                if fails_in_row >= 5:
                    log("EODHD stop: 5 consecutive failures (quota/plan?) — resume later")
                    break
            else:
                fails_in_row = 0
                tot["symbols"] += 1
                for k in ("fin", "bs", "shp", "ann"):
                    tot[k] += res[k]
            conn.commit()
            time.sleep(SLEEP)
    log(f"EODHD done   {tot}")
    return tot


def probe(symbol: str) -> None:
    """Fetch one symbol's fundamentals+news from EODHD and print the shape +
    what would be stored — validates the key/plan before a bulk run. On failure
    it runs a diagnostic sweep: account/plan info, available exchanges, and
    several ticker variants, so one run pinpoints plan-vs-symbol issues."""
    key = _key()
    if not key:
        print("EODHD_API_KEY is not set in the environment")
        return
    sym = f"{symbol.upper()}.NSE"
    print(f"== EODHD probe {sym} ==")
    code, body = _get(f"{BASE}/fundamentals/{sym}?api_token={key}&fmt=json")
    print(f"fundamentals HTTP {code}")
    if code != 200:
        print(f"BODY: {body[:300]}")
        print("\n-- diagnostics --")
        ucode, ubody = _get(f"{BASE}/user?api_token={key}&fmt=json")
        print(f"account HTTP {ucode}: {ubody[:300]}")
        xcode, xbody = _get(f"{BASE}/exchanges-list/?api_token={key}&fmt=json")
        if xcode == 200:
            try:
                exch = json.loads(xbody)
                india = [e for e in exch if isinstance(e, dict) and
                         ("india" in str(e.get("Country", "")).lower()
                          or str(e.get("Code", "")).upper() in ("NSE", "BSE", "BO"))]
                print(f"exchanges-list: {len(exch)} total; India-related: "
                      + (json.dumps(india)[:400] if india else "NONE VISIBLE TO THIS KEY"))
            except ValueError:
                print(f"exchanges-list non-JSON: {xbody[:150]}")
        else:
            print(f"exchanges-list HTTP {xcode}: {xbody[:200]}")
        for variant in (f"{symbol.upper()}.BSE", f"{symbol.upper()}.BO", "500325.BSE", "AAPL.US"):
            vcode, vbody = _get(f"{BASE}/fundamentals/{variant}?api_token={key}&fmt=json")
            head = ""
            if vcode == 200:
                try:
                    head = "sections=" + str(list(json.loads(vbody).keys())[:5])
                except ValueError:
                    head = vbody[:80]
            else:
                head = vbody[:80]
            print(f"fundamentals {variant}: HTTP {vcode}  {head}")
        pcode, pbody = _get(f"{BASE}/eod/{sym}?api_token={key}&fmt=json&period=d&order=d&limit=1")
        print(f"eod price {sym}: HTTP {pcode}  {pbody[:120]}")
        return
    fund = json.loads(body)
    print(f"top-level sections: {list(fund.keys())}")
    gen = fund.get("General") or {}
    print(f"General: name={gen.get('Name')!r} sector={gen.get('Sector')!r} "
          f"industry={gen.get('Industry')!r} updated={gen.get('UpdatedAt')!r}")
    hi = fund.get("Highlights") or {}
    print(f"Highlights sample: PE={hi.get('PERatio')} EPS={hi.get('EarningsShare')} "
          f"MCap={hi.get('MarketCapitalization')} ROE={hi.get('ReturnOnEquityTTM')}")
    fin = map_income(fund)
    bs = map_balance(fund)
    shp = map_holding(fund)
    print(f"mapped: financial periods={len(fin)}  balance sheets={len(bs)}  holding rows={len(shp)}")
    if fin:
        print(f"  latest P&L: {json.dumps({k: v for k, v in fin[0].items() if k != 'raw'})[:400]}")
    if bs:
        print(f"  latest BS : {json.dumps({k: v for k, v in bs[0].items() if k != 'raw'})[:400]}")
    ncode, nbody = _get(f"{BASE}/news?s={sym}&limit=3&api_token={key}&fmt=json")
    print(f"news HTTP {ncode}")
    if ncode == 200:
        try:
            news = map_news(json.loads(nbody))
            print(f"news rows={len(news)}")
            for n in news[:2]:
                print(f"  {n['dt']}  {n['headline'][:90]}")
        except ValueError:
            print(f"news non-JSON: {nbody[:150]}")
    else:
        print(f"news BODY: {nbody[:200]}")
