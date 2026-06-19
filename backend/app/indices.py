"""Live market-index data for the top-bar ticker and the Global Indices page.

Factual index levels only (no advice). Sources:
  * NSE /api/allIndices  -> NIFTY 50, BANK, sectoral indices, INDIA VIX (domestic)
  * BSE SensexData       -> SENSEX (best-effort; BSE's API is flaky/blocked)
  * Yahoo Finance chart  -> international indices (S&P 500, FTSE, Nikkei, ...)
                            + Indian Depository Receipts (ADRs/GDRs)
  * open.er-api.com      -> USD/INR + other INR cross-rates (free, no key)

Each entry carries a `category` ("domestic" | "international" | "currency" |
"depository") and, where relevant, a `country`, plus a best-effort `data_date`
("YYYY-MM-DD", that instrument's own market's last-update date), so the page can
group them and show a per-tab "last updated".

Results are cached in-process for a short TTL. All fetches fail soft: a source
that errors is left out rather than breaking the whole response.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

_CACHE: dict = {"at": 0.0, "data": None}
_TTL = 60.0  # seconds

# NSE allIndices name -> (our key, display label). Domestic (India).
_NSE_MAP = {
    "NIFTY 50": ("NIFTY", "NIFTY"),
    "NIFTY BANK": ("BANKNIFTY", "BANK NIFTY"),
    "NIFTY NEXT 50": ("NIFTYNEXT50", "Nifty Next 50"),
    "NIFTY MIDCAP 100": ("NIFTYMIDCAP100", "Nifty Midcap 100"),
    "NIFTY SMALLCAP 100": ("NIFTYSMLCAP100", "Nifty Smallcap 100"),
    "NIFTY 500": ("NIFTY500", "Nifty 500"),
    "NIFTY IT": ("NIFTYIT", "Nifty IT"),
    "NIFTY FINANCIAL SERVICES": ("NIFTYFINSERVICE", "Nifty Fin Services"),
    "NIFTY AUTO": ("NIFTYAUTO", "Nifty Auto"),
    "NIFTY PHARMA": ("NIFTYPHARMA", "Nifty Pharma"),
    "NIFTY FMCG": ("NIFTYFMCG", "Nifty FMCG"),
    "NIFTY METAL": ("NIFTYMETAL", "Nifty Metal"),
    "NIFTY ENERGY": ("NIFTYENERGY", "Nifty Energy"),
    "NIFTY REALTY": ("NIFTYREALTY", "Nifty Realty"),
    "NIFTY PSU BANK": ("NIFTYPSUBANK", "Nifty PSU Bank"),
    "NIFTY INFRA": ("NIFTYINFRA", "Nifty Infra"),
    "INDIA VIX": ("INDIAVIX", "INDIA VIX"),
}

# Yahoo Finance symbol -> (our key, label, country). International.
_INTL = [
    ("^GSPC", "GSPC", "S&P 500", "United States"),
    ("^DJI", "DJI", "Dow Jones", "United States"),
    ("^IXIC", "IXIC", "Nasdaq", "United States"),
    ("^FTSE", "FTSE", "FTSE 100", "United Kingdom"),
    ("^GDAXI", "GDAXI", "DAX", "Germany"),
    ("^FCHI", "FCHI", "CAC 40", "France"),
    ("^STOXX50E", "STOXX50E", "Euro Stoxx 50", "Europe"),
    ("^N225", "N225", "Nikkei 225", "Japan"),
    ("^HSI", "HSI", "Hang Seng", "Hong Kong"),
    ("000001.SS", "SSEC", "SSE Composite", "China"),
    ("^KS11", "KS11", "KOSPI", "South Korea"),
    ("^TWII", "TWII", "Taiwan Weighted", "Taiwan"),
    ("^AXJO", "AXJO", "ASX 200", "Australia"),
    ("^GSPTSE", "GSPTSE", "S&P/TSX", "Canada"),
    ("^BVSP", "BVSP", "Bovespa", "Brazil"),
]

# Indian Depository Receipts (ADRs on US exchanges / GDRs), via Yahoo.
# (ticker, our key, label, country). Curated to currently-listed names.
_DRS = [
    ("INFY", "INFY", "Infosys (INFY)", "United States (ADR)"),
    ("WIT", "WIT", "Wipro (WIT)", "United States (ADR)"),
    ("IBN", "IBN", "ICICI Bank (IBN)", "United States (ADR)"),
    ("HDB", "HDB", "HDFC Bank (HDB)", "United States (ADR)"),
    ("RDY", "RDY", "Dr. Reddy's (RDY)", "United States (ADR)"),
    ("SIFY", "SIFY", "Sify Technologies (SIFY)", "United States (ADR)"),
    ("MMYT", "MMYT", "MakeMyTrip (MMYT)", "United States (ADR)"),
    ("WNS", "WNS", "WNS Holdings (WNS)", "United States (ADR)"),
    ("RNW", "RNW", "ReNew Energy (RNW)", "United States (ADR)"),
]


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _date_from_unix(ts) -> str | None:
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return None


def _num(v):
    try:
        return round(float(str(v).replace(",", "")), 2)
    except (TypeError, ValueError):
        return None


def _nse_session():
    from curl_cffi import requests as cr
    s = cr.Session(impersonate="chrome")
    try:
        s.get("https://www.nseindia.com", timeout=10)
    except Exception:
        pass
    return s


def _fetch_nse(out: list) -> None:
    today = _today_utc()
    try:
        s = _nse_session()
        r = s.get(
            "https://www.nseindia.com/api/allIndices",
            timeout=12,
            headers={"Referer": "https://www.nseindia.com/",
                     "Accept": "application/json, text/plain, */*"},
        )
        rows = r.json().get("data", [])
        idx = {x.get("index"): x for x in rows}
        for nse_name, (key, label) in _NSE_MAP.items():
            x = idx.get(nse_name)
            if x:
                out.append({"key": key, "label": label,
                            "value": _num(x.get("last")),
                            "change_pct": _num(x.get("percentChange")),
                            "category": "domestic", "country": "India",
                            "data_date": today})
    except Exception:
        pass


def _fetch_sensex(out: list) -> None:
    # Best-effort: BSE's API frequently times out / returns HTML from outside India.
    try:
        from curl_cffi import requests as cr
        r = cr.get(
            "https://api.bseindia.com/BseIndiaAPI/api/SensexData/w?json=true",
            impersonate="chrome", timeout=8,
            headers={"Referer": "https://www.bseindia.com/",
                     "Accept": "application/json, text/plain, */*"},
        )
        d = r.json()
        node = d.get("Sensex") or d.get("Table", [{}])[0] if isinstance(d, dict) else {}
        if isinstance(node, list):
            node = node[0] if node else {}
        val = _num(node.get("Value") or node.get("ltp") or node.get("CurrValue"))
        chg = _num(node.get("ChgPer") or node.get("PerChg") or node.get("pchange"))
        if val:
            out.append({"key": "SENSEX", "label": "SENSEX", "value": val,
                        "change_pct": chg, "category": "domestic",
                        "country": "India", "data_date": _today_utc()})
    except Exception:
        pass


def _fetch_intl(out: list) -> None:
    """International indices via Yahoo's v8 chart endpoint (one call per symbol,
    fail-soft). Change % derived from the previous close in the chart meta."""
    try:
        from curl_cffi import requests as cr
    except Exception:
        return
    for ysym, key, label, country in _INTL:
        try:
            r = cr.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{ysym}"
                "?range=2d&interval=1d&includePrePost=false",
                impersonate="chrome", timeout=8,
                headers={"Accept": "application/json"},
            )
            meta = (r.json().get("chart", {}).get("result") or [{}])[0].get("meta", {})
            price = meta.get("regularMarketPrice")
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            val = _num(price)
            chg = _num((price - prev) / prev * 100) if price and prev else None
            if val is not None:
                out.append({"key": key, "label": label, "value": val,
                            "change_pct": chg, "category": "international",
                            "country": country,
                            "data_date": _date_from_unix(meta.get("regularMarketTime"))})
        except Exception:
            pass


# INR cross-rates to emit: (key, label, base currency code), INR-per-X.
_FX = [
    ("USDINR", "USD/INR", "USD"),
    ("EURINR", "EUR/INR", "EUR"),
    ("GBPINR", "GBP/INR", "GBP"),
    ("JPYINR", "JPY/INR", "JPY"),
    ("AEDINR", "AED/INR", "AED"),
    ("SGDINR", "SGD/INR", "SGD"),
    ("AUDINR", "AUD/INR", "AUD"),
    ("CADINR", "CAD/INR", "CAD"),
]


def _fetch_fx(out: list) -> None:
    """INR cross-rates from open.er-api.com (free, no key). Rates are quoted per
    USD; INR-per-X = rates['INR'] / rates['X']. No prev close -> change_pct None.
    Fail-soft. Keeps USDINR present (top-bar ticker references that key)."""
    try:
        from curl_cffi import requests as cr
        d = cr.get("https://open.er-api.com/v6/latest/USD", timeout=8).json()
        rates = d.get("rates", {})
        inr = rates.get("INR")
        if not inr:
            return
        # er-api gives e.g. "Wed, 19 Jun 2024 00:00:01 +0000"; fall back to today.
        ddate = _today_utc()
        raw = d.get("time_last_update_utc")
        if raw:
            try:
                ddate = datetime.strptime(
                    raw, "%a, %d %b %Y %H:%M:%S %z").strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass
        for key, label, code in _FX:
            base = rates.get(code)
            if not base:
                continue
            per = float(inr) / float(base)
            v = round(per, 3) if code == "JPY" else round(per, 2)
            out.append({"key": key, "label": label, "value": v,
                        "change_pct": None, "category": "currency",
                        "country": "India", "data_date": ddate})
    except Exception:
        pass


def _fetch_drs(out: list) -> None:
    """Indian Depository Receipts (ADRs/GDRs) via Yahoo's v8 chart endpoint, one
    call per symbol, fail-soft per symbol. change_pct from the chart-meta prev
    close; data_date from regularMarketTime."""
    try:
        from curl_cffi import requests as cr
    except Exception:
        return
    for ysym, key, label, country in _DRS:
        try:
            r = cr.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{ysym}"
                "?range=2d&interval=1d&includePrePost=false",
                impersonate="chrome", timeout=8,
                headers={"Accept": "application/json"},
            )
            meta = (r.json().get("chart", {}).get("result") or [{}])[0].get("meta", {})
            price = meta.get("regularMarketPrice")
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            val = _num(price)
            chg = _num((price - prev) / prev * 100) if price and prev else None
            if val is not None:
                out.append({"key": key, "label": label, "value": val,
                            "change_pct": chg, "category": "depository",
                            "country": country,
                            "data_date": _date_from_unix(meta.get("regularMarketTime"))})
        except Exception:
            pass


def get_indices(force: bool = False) -> dict:
    now = time.monotonic()
    cached = _CACHE["data"]
    if cached is not None and not force and (now - _CACHE["at"]) < _TTL:
        return cached

    out: list = []
    _fetch_nse(out)
    _fetch_sensex(out)
    _fetch_intl(out)
    _fetch_fx(out)
    _fetch_drs(out)

    # Stable headline order first (used by the top-bar ticker), then the rest.
    rank = {"NIFTY": 0, "BANKNIFTY": 1, "SENSEX": 2, "INDIAVIX": 3, "USDINR": 4,
            "GSPC": 5, "IXIC": 6}
    out.sort(key=lambda x: rank.get(x["key"], 99))

    result = {"indices": out, "as_of": datetime.now(timezone.utc).isoformat()}
    _CACHE["data"] = result
    _CACHE["at"] = now
    return result
