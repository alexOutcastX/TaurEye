"""Source adapters: turn each OFFICIAL feed into normalized rows.

Every parser is defensive about column names because the exchanges ship CSVs
with leading spaces in headers and occasionally rename columns. We look columns
up case-insensitively against a set of known aliases, so a small format drift
doesn't silently corrupt the spine — it raises instead.
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import date

from urllib.parse import quote

from . import http
from .config import (
    BSE_BHAV_UDIFF,
    BSE_HOME,
    BSE_LIST_SCRIP,
    NSE_BHAV_LEGACY,
    NSE_BHAV_UDIFF,
    NSE_CORP_ACTIONS,
    NSE_CORP_ACTIONS_PAGE,
    NSE_EQUITY_LIST,
    NSE_ETF_LIST,
    NSE_QUOTE_EQUITY,
    NSE_QUOTE_PAGE,
)
from .types import CorpAction, MasterRow, PriceRow

# Series we treat as ordinary cash-equity (exclude ETFs/derivatives/test).
EQUITY_SERIES = {"EQ", "BE", "BZ", "SM", "ST", "A", "B", "T", "X", "XT"}


# ---------- date URL formatting ----------
def _fmt(template: str, d: date) -> str:
    return template.format(
        d=f"{d.day:02d}",
        m=f"{d.month:02d}",
        Y=f"{d.year:04d}",
        y=f"{d.year % 100:02d}",
        ymd=f"{d.year:04d}{d.month:02d}{d.day:02d}",
        dmy=f"{d.day:02d}{d.month:02d}{d.year:04d}",
        DMon=f"{d.day:02d}{d.strftime('%b')}{d.year:04d}",
    )


# ---------- CSV helpers ----------
def _reader(text: str) -> list[dict[str, str]]:
    rows = list(csv.DictReader(io.StringIO(text)))
    # Strip whitespace from keys (exchanges love leading spaces) and values.
    out = []
    for r in rows:
        out.append({(k or "").strip(): (v or "").strip() for k, v in r.items()})
    return out


def _pick(row: dict[str, str], *aliases: str) -> str | None:
    lower = {k.lower(): v for k, v in row.items()}
    for a in aliases:
        v = lower.get(a.lower())
        if v not in (None, ""):
            return v
    return None


def _num(v: str | None) -> float | None:
    if v is None or v == "" or v == "-":
        return None
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


# ---------- NSE security master (EQUITY_L.csv) ----------
def nse_equity_master() -> list[MasterRow]:
    text = http.fetch_text(NSE_EQUITY_LIST, cache_name="EQUITY_L.csv")
    out: list[MasterRow] = []
    for r in _reader(text):
        isin = _pick(r, "ISIN NUMBER", "ISIN")
        symbol = _pick(r, "SYMBOL")
        if not isin or not symbol:
            continue
        out.append(
            MasterRow(
                isin=isin,
                name=_pick(r, "NAME OF COMPANY", "NAME") or symbol,
                nse_symbol=symbol,
                series=_pick(r, "SERIES"),
                face_value=_num(_pick(r, "FACE VALUE")),
                listed_on=_pick(r, "DATE OF LISTING"),
            )
        )
    return out


# ---------- ETF master (for segment classification) ----------
def nse_etf_list() -> set[str]:
    """Return the set of ISINs that are ETFs, per NSE's published ETF list.

    Used to tag the `securities.segment` so the screener can include/exclude
    ETFs. Returns an empty set on any failure — the caller then falls back to
    ISIN-prefix/symbol heuristics, so classification still degrades gracefully.
    """
    try:
        text = http.fetch_text(NSE_ETF_LIST, cache_name="eq_etfseclist.csv")
    except Exception:
        return set()
    out: set[str] = set()
    for r in _reader(text):
        isin = _pick(r, "ISINNumber", "ISIN NUMBER", "ISIN")
        if isin:
            out.add(isin.strip())
    return out


# ---------- bhavcopy parsers ----------
def _parse_udiff(text: str, exchange: str, trade_date: date) -> list[PriceRow]:
    """Parse a UDiFF-format bhavcopy (NSE or BSE share the same standard)."""
    iso = trade_date.isoformat()
    out: list[PriceRow] = []
    for r in _reader(text):
        series = (_pick(r, "SctySrs", "SERIES", "Sgmt") or "").upper()
        instr = (_pick(r, "FinInstrmTp", "FinInstrmType") or "").upper()
        # Keep only cash equities; UDiFF marks them STK (or via equity series).
        if instr and instr not in {"STK", "EQ", ""}:
            continue
        if series and series not in EQUITY_SERIES:
            continue
        isin = _pick(r, "ISIN", "ISIN NUMBER")
        symbol = _pick(r, "TckrSymb", "SYMBOL")
        name = _pick(r, "FinInstrmNm", "SC_NAME", "SECURITY") or ""
        o = _num(_pick(r, "OpnPric", "OPEN", "OPEN_PRICE"))
        h = _num(_pick(r, "HghPric", "HIGH", "HIGH_PRICE"))
        lo = _num(_pick(r, "LwPric", "LOW", "LOW_PRICE"))
        c = _num(_pick(r, "ClsPric", "CLOSE", "CLOSE_PRICE"))
        vol = _num(_pick(r, "TtlTradgVol", "TOTTRDQTY", "TTL_TRD_QNTY"))
        if not isin or not symbol or None in (o, h, lo, c):
            continue
        out.append(
            PriceRow(
                isin=isin, symbol=symbol, date=iso,
                open=o, high=h, low=lo, close=c,
                volume=int(vol or 0), exchange=exchange, name=name.strip(),
            )
        )
    return out


def _parse_nse_legacy(text: str, trade_date: date) -> list[PriceRow]:
    """Parse NSE sec_bhavdata_full (legacy CSV). ISIN is NOT in this file, so
    symbol is the key; the ingest joins ISIN via the security master."""
    iso = trade_date.isoformat()
    out: list[PriceRow] = []
    for r in _reader(text):
        series = (_pick(r, "SERIES") or "").upper()
        if series and series not in EQUITY_SERIES:
            continue
        symbol = _pick(r, "SYMBOL")
        o = _num(_pick(r, "OPEN_PRICE", "OPEN"))
        h = _num(_pick(r, "HIGH_PRICE", "HIGH"))
        lo = _num(_pick(r, "LOW_PRICE", "LOW"))
        c = _num(_pick(r, "CLOSE_PRICE", "CLOSE"))
        vol = _num(_pick(r, "TTL_TRD_QNTY", "TOTTRDQTY"))
        if not symbol or None in (o, h, lo, c):
            continue
        out.append(
            PriceRow(
                isin="", symbol=symbol, date=iso,
                open=o, high=h, low=lo, close=c,
                volume=int(vol or 0), exchange="NSE",
            )
        )
    return out


def nse_bhavcopy(trade_date: date) -> list[PriceRow]:
    """NSE EOD: try UDiFF zip first, fall back to legacy full CSV."""
    try:
        url = _fmt(NSE_BHAV_UDIFF, trade_date)
        text = http.fetch_zip_member(url, cache_name=f"nse_udiff_{trade_date.isoformat()}.csv")
        rows = _parse_udiff(text, "NSE", trade_date)
        if rows:
            return rows
    except Exception:
        pass
    url = _fmt(NSE_BHAV_LEGACY, trade_date)
    text = http.fetch_text(url, cache_name=f"nse_legacy_{trade_date.isoformat()}.csv")
    return _parse_nse_legacy(text, trade_date)


def bse_bhavcopy(trade_date: date) -> list[PriceRow]:
    """BSE EOD: UDiFF raw CSV (carries ISIN + name).

    BSE serves this uncompressed (not zipped), so we fetch text directly. The
    not_html validation in fetch_text rejects the Angular shell that BSE returns
    for a missing date, so a holiday/no-data day fails cleanly instead of being
    parsed as garbage.
    """
    url = _fmt(BSE_BHAV_UDIFF, trade_date)
    text = http.fetch_text(url, cache_name=f"bse_udiff_{trade_date.isoformat()}.csv")
    return _parse_udiff(text, "BSE", trade_date)


# ---------- shares outstanding (NSE quote) ----------
def nse_issued_shares(symbol: str) -> float | None:
    """Return the issued share count for one NSE symbol, or None.

    Reads securityInfo.issuedSize from the quote-equity JSON. That field is an
    unambiguous COUNT of shares (not a rupee market-cap value), so multiplying it
    by the close price yields an accurate market cap with no lakh/crore unit
    confusion. The response is intentionally not cached: it's a live quote that
    changes, and caching thousands of per-symbol JSON files would bloat data/raw.
    """
    enc = quote(symbol, safe="")
    url = NSE_QUOTE_EQUITY.format(sym=enc)
    # NSE's WAF wants the browser quote page as Referer + a JSON Accept, AND the
    # Akamai bot cookies that only a get-quotes page load sets. prime_nse_quotes
    # collects those once per session; on a 403 we re-warm and retry once because
    # the cookies expire.
    ref = NSE_QUOTE_PAGE.format(sym=enc)
    accept = "application/json, text/plain, */*"
    http.prime_nse_quotes()
    raw: str | None = None
    for attempt in range(2):
        try:
            raw = http.fetch_text(url, cache_name=None, referer=ref, accept=accept)
            break
        except http.FetchError:
            if attempt == 0:
                http.prime_nse_quotes(force=True)  # cookies likely stale -> re-warm
                continue
            return None
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    info = data.get("securityInfo") or {}
    issued = info.get("issuedSize")
    val = _num(str(issued)) if issued is not None else None
    return val if (val and val > 0) else None


# ---------- market cap (BSE bulk list-of-scrips) ----------
def _fetch_browser_json(url: str, referer: str) -> str | None:
    """GET a JSON endpoint using a browser-grade TLS fingerprint.

    BSE's API answers a plain `requests` call from some networks with an empty/
    HTML body; curl_cffi's Chrome impersonation gets a clean 200 JSON. We try it
    first and fall back to the ordinary retrying session so the engine still works
    if curl_cffi isn't installed.
    """
    try:
        from curl_cffi import requests as cffi  # optional dependency
        resp = cffi.get(
            url, impersonate="chrome", timeout=60,
            headers={"Referer": referer, "Accept": "application/json, text/plain, */*"},
        )
        if resp.status_code == 200 and resp.content:
            return resp.text
    except Exception:
        pass
    try:
        return http.fetch_text(
            url, cache_name=None, referer=referer,
            accept="application/json, text/plain, */*",
        )
    except Exception:
        return None


def bse_all_market_caps() -> dict[str, float]:
    """Return {ISIN: market_cap_in_crore} for the whole BSE equity universe.

    The ListofScripData feed ships `Mktcap` already denominated in Rs crore
    (verified: RELIANCE ~17.87 lakh cr, Yamuna Syndicate ~934 cr), keyed by
    ISIN_NUMBER so the value joins straight onto securities.isin.
    """
    text = _fetch_browser_json(BSE_LIST_SCRIP, BSE_HOME + "/")
    if not text:
        return {}
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return {}
    rows = data if isinstance(data, list) else data.get("Table", []) or data.get("data", [])
    out: dict[str, float] = {}
    for row in rows:
        isin = (row.get("ISIN_NUMBER") or row.get("ISIN") or "").strip()
        mc = _num(str(row.get("Mktcap"))) if row.get("Mktcap") is not None else None
        if isin and mc and mc > 0:
            out[isin] = mc
    return out


def bse_scrip_codes() -> dict[str, str]:
    """Return {ISIN: BSE scrip code} from the bulk ListofScripData feed.

    The BSE fundamentals APIs (financial results, shareholding, announcements) are
    keyed by the numeric scrip code, but the NSE-sourced security master never
    carries it. This feed (already used for market caps) pairs each ISIN with its
    SCRIP_CD, so a single call backfills securities.bse_code for the whole BSE
    universe (and, via shared ISIN, the NSE-listed names too)."""
    text = _fetch_browser_json(BSE_LIST_SCRIP, BSE_HOME + "/")
    if not text:
        return {}
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return {}
    rows = data if isinstance(data, list) else data.get("Table", []) or data.get("data", [])
    out: dict[str, str] = {}
    for row in rows:
        isin = (row.get("ISIN_NUMBER") or row.get("ISIN") or "").strip()
        code = None
        for k in ("SCRIP_CD", "Scrip_Cd", "scrip_cd", "SC_CODE", "ScripCode",
                  "Scrip_Code", "scripcode", "FinInstrmId"):
            v = row.get(k)
            if v not in (None, "", "0", 0):
                code = str(v).strip()
                break
        if isin and code:
            out[isin] = code
    return out


# ---------- corporate actions (NSE) ----------
_SPLIT_RE = re.compile(r"(?:from\s+rs[.\s]*|fv\s*)?(\d+(?:\.\d+)?)\D+(?:to\s+rs[.\s]*)?(\d+(?:\.\d+)?)", re.I)
_BONUS_RE = re.compile(r"bonus\D+(\d+)\s*[:/]\s*(\d+)", re.I)


def _parse_ex_date(s: str | None) -> str | None:
    if not s:
        return None
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d %b %Y"):
        try:
            from datetime import datetime
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_ca_rows(rows: list[dict]) -> list[CorpAction]:
    """Turn raw NSE corporate-action JSON rows into split/bonus CorpActions.

    ratio = multiplicative factor applied to PRE-ex prices to make them
    comparable with post-ex prices. A 10->2 face-value split multiplies old
    prices by 2/10 = 0.2; a 1:1 bonus multiplies by 1/(1+1) = 0.5.
    """
    out: list[CorpAction] = []
    for item in rows:
        isin = (item.get("isin") or "").strip()
        symbol = (item.get("symbol") or "").strip()
        subject = (item.get("subject") or "").strip()
        ex = _parse_ex_date(item.get("exDate") or item.get("ex_date"))
        # symbol is enough to resolve the canonical ISIN downstream, so accept a
        # row that has either identifier (the feed's ISIN can be stale/changed).
        if (not isin and not symbol) or not ex or not subject:
            continue
        sub = subject.lower()
        if "split" in sub:
            m = _SPLIT_RE.search(subject)
            if m:
                old, new = float(m.group(1)), float(m.group(2))
                if old > 0:
                    out.append(CorpAction(isin, ex, "split", new / old, subject, "NSE", symbol))
        elif "bonus" in sub:
            m = _BONUS_RE.search(subject)
            if m:
                a, b = float(m.group(1)), float(m.group(2))
                if (a + b) > 0:
                    out.append(CorpAction(isin, ex, "bonus", b / (a + b), subject, "NSE", symbol))
    return out


# Dividend cash amount from an NSE corp-action subject. The face-value clause
# ("Of Rs 10/- Each") is stripped first so it isn't mistaken for the dividend.
# Pure-percentage dividends ("Dividend - 50%") are skipped (need face value).
_DIV_FV_RE = re.compile(r"\bof\s+(?:rs|re|inr|₹)\.?\s*\d+(?:\.\d+)?\s*/?\s*-?\s*each\b", re.I)
_DIV_AMT_RE = re.compile(r"(?:rs|re|inr|₹)\.?\s*(\d+(?:\.\d+)?)", re.I)


def _parse_dividend(subject: str) -> float | None:
    s = (subject or "").strip()
    if "dividend" not in s.lower():
        return None
    cleaned = _DIV_FV_RE.sub(" ", s)  # drop the face-value clause
    m = _DIV_AMT_RE.search(cleaned)
    if not m:
        return None
    try:
        amt = float(m.group(1))
    except ValueError:
        return None
    return amt if 0 < amt <= 100000 else None


def _ca_window_rows(start: date | None):
    """Yield (win_start, raw_rows) for each <=365-day NSE corp-action window.
    Shared by nse_corp_actions and nse_dividends; the http cache makes the second
    caller free (same URLs / cache_name)."""
    from datetime import date as _date, timedelta
    today = _date.today()
    end = today + timedelta(days=60)
    win_start = start or (today - timedelta(days=460))
    while win_start <= end:
        win_end = min(win_start + timedelta(days=365), end)
        url = NSE_CORP_ACTIONS.format(
            frm=win_start.strftime("%d-%m-%Y"), to=win_end.strftime("%d-%m-%Y")
        )
        try:
            raw = http.fetch_text(
                url,
                cache_name=f"nse_corp_actions_{win_start.isoformat()}_{win_end.isoformat()}.json",
                referer=NSE_CORP_ACTIONS_PAGE,
                accept="application/json, text/plain, */*",
            )
            data = json.loads(raw)
            rows = data if isinstance(data, list) else data.get("data", [])
        except Exception:
            rows = []
        yield win_start, rows
        win_start = win_end + timedelta(days=1)


def nse_dividends(start: date | None = None) -> list[dict]:
    """Cash dividends parsed from the same NSE corp-action feed (split/bonus go
    to nse_corp_actions). Returns dicts: isin, symbol, ex_date, amount, detail."""
    out: list[dict] = []
    seen: set[tuple] = set()
    for _, rows in _ca_window_rows(start):
        for item in rows:
            subject = (item.get("subject") or "").strip()
            if "dividend" not in subject.lower():
                continue
            amt = _parse_dividend(subject)
            if amt is None:
                continue
            ex = _parse_ex_date(item.get("exDate") or item.get("ex_date"))
            isin = (item.get("isin") or "").strip()
            symbol = (item.get("symbol") or "").strip()
            if not ex or (not isin and not symbol):
                continue
            key = (isin, symbol, ex)
            if key in seen:
                continue
            seen.add(key)
            out.append({"isin": isin, "symbol": symbol, "ex_date": ex, "amount": amt, "detail": subject})
    return out


def nse_corp_actions(start: date | None = None) -> list[CorpAction]:
    """Fetch NSE corporate actions (split/bonus) covering [start .. today+60d].

    Called without `start`, it spans the last ~460 days (enough for a normal
    nightly run). For a multi-year backfill, pass the earliest price date so
    historical splits/bonuses are captured and the old history adjusts correctly.
    The feed caps long date ranges, so the span is fetched in <=365-day windows
    and de-duplicated. Past windows cache cleanly, so re-runs are cheap.
    """
    out: list[CorpAction] = []
    seen: set[tuple] = set()
    for _, rows in _ca_window_rows(start):
        for ca in _parse_ca_rows(rows):
            key = (ca.isin, ca.symbol, ca.ex_date, ca.kind)
            if key not in seen:
                seen.add(key)
                out.append(ca)
    return out
