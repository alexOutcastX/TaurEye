"""Live market-index ticker data for the top bar.

Factual index levels only (no advice). Sources:
  * NSE /api/allIndices  -> NIFTY 50, NIFTY BANK, INDIA VIX (with % change)
  * BSE SensexData       -> SENSEX (best-effort; BSE's API is flaky/blocked from
                            some networks, so it's omitted gracefully on failure)
  * open.er-api.com      -> USD/INR spot (free, no key)

Results are cached in-process for a short TTL so the top bar can poll without
hammering the upstreams. All fetches fail soft: a source that errors is simply
left out of the response rather than breaking the whole ticker.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

_CACHE: dict = {"at": 0.0, "data": None}
_TTL = 60.0  # seconds

# NSE allIndices name -> (our key, display label)
_NSE_MAP = {
    "NIFTY 50": ("NIFTY", "NIFTY"),
    "NIFTY BANK": ("BANKNIFTY", "BANK NIFTY"),
    "INDIA VIX": ("INDIAVIX", "INDIA VIX"),
}


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


def _fetch_nse(out: list, order: dict) -> None:
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
                            "change_pct": _num(x.get("percentChange"))})
                order[key] = True
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
        # Defensive across shapes: try a few likely value/change keys.
        node = d.get("Sensex") or d.get("Table", [{}])[0] if isinstance(d, dict) else {}
        if isinstance(node, list):
            node = node[0] if node else {}
        val = _num(node.get("Value") or node.get("ltp") or node.get("CurrValue"))
        chg = _num(node.get("ChgPer") or node.get("PerChg") or node.get("pchange"))
        if val:
            out.append({"key": "SENSEX", "label": "SENSEX",
                        "value": val, "change_pct": chg})
    except Exception:
        pass


def _fetch_usdinr(out: list) -> None:
    try:
        from curl_cffi import requests as cr
        r = cr.get("https://open.er-api.com/v6/latest/USD", timeout=8)
        inr = r.json().get("rates", {}).get("INR")
        v = _num(inr)
        if v:
            out.append({"key": "USDINR", "label": "USD/INR",
                        "value": v, "change_pct": None})
    except Exception:
        pass


def get_indices(force: bool = False) -> dict:
    now = time.monotonic()
    cached = _CACHE["data"]
    if cached is not None and not force and (now - _CACHE["at"]) < _TTL:
        return cached

    out: list = []
    order: dict = {}
    _fetch_nse(out, order)
    _fetch_sensex(out)
    _fetch_usdinr(out)

    # Stable display order regardless of which sources answered.
    rank = {"NIFTY": 0, "BANKNIFTY": 1, "SENSEX": 2, "INDIAVIX": 3, "USDINR": 4}
    out.sort(key=lambda x: rank.get(x["key"], 99))

    result = {"indices": out, "as_of": datetime.now(timezone.utc).isoformat()}
    _CACHE["data"] = result
    _CACHE["at"] = now
    return result
