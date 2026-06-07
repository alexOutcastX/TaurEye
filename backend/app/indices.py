"""Live market-index data for the top-bar ticker and the Global Indices page.

Factual index levels only (no advice). Sources:
  * NSE /api/allIndices  -> NIFTY 50, BANK, sectoral indices, INDIA VIX (domestic)
  * BSE SensexData       -> SENSEX (best-effort; BSE's API is flaky/blocked)
  * Yahoo Finance chart  -> international indices (S&P 500, FTSE, Nikkei, ...)
  * open.er-api.com      -> USD/INR spot (free, no key)

Each entry carries a `category` ("domestic" | "international" | "currency") and,
where relevant, a `country`, so the Global Indices page can group them.

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
                            "category": "domestic", "country": "India"})
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
                        "change_pct": chg, "category": "domestic", "country": "India"})
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
                            "country": country})
        except Exception:
            pass


def _fetch_usdinr(out: list) -> None:
    try:
        from curl_cffi import requests as cr
        r = cr.get("https://open.er-api.com/v6/latest/USD", timeout=8)
        inr = r.json().get("rates", {}).get("INR")
        v = _num(inr)
        if v:
            out.append({"key": "USDINR", "label": "USD/INR", "value": v,
                        "change_pct": None, "category": "currency", "country": "India"})
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
    _fetch_usdinr(out)

    # Stable headline order first (used by the top-bar ticker), then the rest.
    rank = {"NIFTY": 0, "BANKNIFTY": 1, "SENSEX": 2, "INDIAVIX": 3, "USDINR": 4,
            "GSPC": 5, "IXIC": 6}
    out.sort(key=lambda x: rank.get(x["key"], 99))

    result = {"indices": out, "as_of": datetime.now(timezone.utc).isoformat()}
    _CACHE["data"] = result
    _CACHE["at"] = now
    return result
