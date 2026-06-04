"""Corporate-action price adjustment.

A split or bonus drops the raw price overnight without any economic loss. If you
screen on raw closes, every split looks like a -80% crash and every moving
average breaks. We fix this with a back-adjustment factor:

  * Walk corporate actions newest-first.
  * For each ex-date, every candle STRICTLY BEFORE it gets multiplied by the
    action's ratio (cumulatively, so multiple actions compound).
  * adj_close = close * cumulative_factor_at_that_date.

Raw OHLCV is preserved untouched in the DB; adj_close + adj_factor are stored
alongside so the screener can use either. Indicators should read adj_close.
"""
from __future__ import annotations

from .types import CorpAction, PriceRow


def adjustment_factors(dates: list[str], actions: list[CorpAction]) -> dict[str, float]:
    """Map each date -> cumulative back-adjustment factor.

    `dates` must be sorted ascending (ISO strings sort chronologically).
    A candle on date D is multiplied by the product of ratios of all actions
    whose ex_date is AFTER D (i.e. future splits/bonuses relative to that candle).

    Back-adjustment is anchored to the LATEST bar (current market price): only
    actions that have already gone ex (ex_date <= the most recent date) are
    applied. An upcoming, not-yet-effective action is ignored, because applying
    it would scale the current close and every historical bar away from the real
    traded price — i.e. the latest bar must always equal CMP.
    """
    factors = {d: 1.0 for d in dates}
    if not actions or not dates:
        return factors
    latest = dates[-1]  # dates are sorted ascending
    for ca in actions:
        if ca.ex_date > latest:
            continue  # not yet effective: must not move the current/CMP price
        for d in dates:
            if d < ca.ex_date:
                factors[d] *= ca.ratio
    return factors


def apply_adjustments(rows: list[PriceRow], actions: list[CorpAction]) -> list[dict]:
    """Return DB-ready dicts with adj_factor + adj_close for one ISIN's history."""
    rows_sorted = sorted(rows, key=lambda r: r.date)
    dates = [r.date for r in rows_sorted]
    factors = adjustment_factors(dates, actions)
    out: list[dict] = []
    for r in rows_sorted:
        f = factors[r.date]
        out.append(
            {
                "isin": r.isin,
                "date": r.date,
                "open": r.open,
                "high": r.high,
                "low": r.low,
                "close": r.close,
                "volume": r.volume,
                "adj_factor": f,
                "adj_close": round(r.close * f, 4),
                "source": r.exchange,
            }
        )
    return out
