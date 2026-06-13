"""Stitch a scrip's ISIN regimes into one continuous history.

When a security changes ISIN (a face-value split mints a new ISIN, a scheme of
arrangement re-lists it, …) its price history splits across two ISINs: the OLD
one carries the deep history and stops, the NEW one carries the live bars. Each
ISIN is independently corporate-action ADJUSTED by `adjust.py`, but nothing
bridges the boundary, so the per-symbol chart/metrics only ever see one regime —
either a stale frozen series or a short one missing years of history.

This module merges the per-ISIN ADJUSTED series at READ/EXPORT time (the raw
price spine is never touched, so the fix is fully reversible and can't corrupt
data). Regimes are passed live-first; each older regime is scaled by the ratio
of the two adjusted closes on their overlapping dates (so a real split between
regimes lines up seamlessly) and used only to extend the series further back.
"""
from __future__ import annotations

from statistics import median


def overlap_factor(live_adj: dict[str, float], old_adj: dict[str, float]) -> float:
    """Multiplier that maps the OLD regime's adjusted scale onto the LIVE one,
    from the median ratio over dates both regimes priced. 1.0 when they never
    overlap (best effort: assume same scale)."""
    ratios = [
        live_adj[d] / old_adj[d]
        for d in old_adj
        if d in live_adj and old_adj[d]
    ]
    return median(ratios) if ratios else 1.0


def merge_regimes(regimes: list[list[dict]]) -> list[dict]:
    """Combine per-ISIN ADJUSTED candle lists into one continuous series.

    `regimes` is ordered LIVE-FIRST (regimes[0] is the current ISIN). Each candle
    is a dict with date/open/high/low/close/volume where close is the adjusted
    close and o/h/l are adjusted too. The live regime is kept verbatim; each
    older regime is scaled by `overlap_factor` and contributes only the dates
    strictly older than what we already have (so the live bars always win and the
    latest bar stays equal to the current market price).
    """
    merged: dict[str, dict] = {}
    for c in regimes[0] if regimes else []:
        merged[c["date"]] = c
    for old in regimes[1:]:
        if not old:
            continue
        live_adj = {d: merged[d]["close"] for d in merged}
        old_adj = {c["date"]: c["close"] for c in old}
        k = overlap_factor(live_adj, old_adj)
        cur_min = min(merged) if merged else None
        for c in old:
            if cur_min is not None and c["date"] >= cur_min:
                continue
            merged[c["date"]] = {
                "date": c["date"],
                "open": round(c["open"] * k, 4),
                "high": round(c["high"] * k, 4),
                "low": round(c["low"] * k, 4),
                "close": round(c["close"] * k, 4),
                "volume": c["volume"],
            }
    return [merged[d] for d in sorted(merged)]


# --- DB helpers (sqlite-only, no pydantic) shared by the provider + exporter ---

def symbol_isins(conn) -> dict[str, list[str]]:
    """Map each trading symbol -> its ISIN(s), LIVE-FIRST (freshest last bar
    first). A scrip that changed ISIN has >1 here; most have a single entry. Only
    ISINs that actually carry price rows are included."""
    rows = conn.execute(
        """SELECT s.isin AS isin,
                  COALESCE(s.nse_symbol, s.bse_symbol) AS symbol,
                  (SELECT MAX(date) FROM prices p WHERE p.isin = s.isin) AS hi
           FROM securities s
           WHERE COALESCE(s.nse_symbol, s.bse_symbol) IS NOT NULL
             AND EXISTS (SELECT 1 FROM prices p WHERE p.isin = s.isin)"""
    ).fetchall()
    by_symbol: dict[str, list[tuple[str, str]]] = {}
    for r in rows:
        by_symbol.setdefault(r["symbol"], []).append((r["hi"] or "", r["isin"]))
    # Sort each symbol's ISINs by last-bar date DESC so regimes[0] is the live one.
    return {
        sym: [isin for _, isin in sorted(items, reverse=True)]
        for sym, items in by_symbol.items()
    }


def isin_adjusted(conn, isin: str) -> list[dict]:
    """One ISIN's full corporate-action-ADJUSTED candle history (as dicts)."""
    rows = conn.execute(
        "SELECT date, open, high, low, close, volume, adj_factor, adj_close"
        " FROM prices WHERE isin=? ORDER BY date",
        (isin,),
    ).fetchall()
    out: list[dict] = []
    for r in rows:
        f = r["adj_factor"] or 1.0
        out.append({
            "date": r["date"],
            "open": round(r["open"] * f, 4),
            "high": round(r["high"] * f, 4),
            "low": round(r["low"] * f, 4),
            "close": r["adj_close"] if r["adj_close"] is not None else round(r["close"] * f, 4),
            "volume": int(r["volume"]),
        })
    return out


def merged_history(conn, isins: list[str]) -> list[dict]:
    """Full continuous adjusted history for a symbol across all its ISIN regimes
    (live-first). Single-ISIN symbols pass straight through unchanged."""
    return merge_regimes([isin_adjusted(conn, isin) for isin in isins])
