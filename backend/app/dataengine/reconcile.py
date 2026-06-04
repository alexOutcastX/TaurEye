"""Cross-source reconciliation.

For every ISIN present in BOTH the NSE and BSE bhavcopies on the same date we
compare OHLC. If they agree within tolerance the row is tagged "NSE+BSE"
(cross-verified — the strongest accuracy signal).

When they disagree it is almost always because one venue's print is a stale
illiquid tick (e.g. a name that traded 4 shares on BSE), NOT a feed error. NSE
is the primary, far more liquid venue and is itself an official source, so on
disagreement we KEEP the NSE print as golden (tagged plain "NSE") and ALSO write
the mismatch to the quarantine table as an audit record. This preserves full
screener coverage while still flagging every discrepancy for review — dropping
the row entirely would silently hide ~1,600 legitimately-listed scrips.

Securities listed on only one exchange can't be cross-checked, so they pass
through as single-source (tagged with their exchange) via the `source` column.
"""
from __future__ import annotations

from .config import RECON_TOLERANCE_ABS, RECON_TOLERANCE_PCT
from .types import PriceRow


def _agree(a: float, b: float) -> bool:
    diff = abs(a - b)
    if diff <= RECON_TOLERANCE_ABS:
        return True
    denom = max(abs(a), abs(b), 1e-9)
    return (diff / denom) <= RECON_TOLERANCE_PCT


def reconcile(
    nse: list[PriceRow], bse: list[PriceRow]
) -> tuple[list[PriceRow], list[dict]]:
    """Return (golden_rows, quarantine_records).

    Golden row preference when both agree: NSE is the primary print for liquidity
    reasons, but its volume is exchange-local so we keep NSE's OHLC + volume.
    """
    by_isin_nse = {r.isin: r for r in nse if r.isin}
    by_isin_bse = {r.isin: r for r in bse if r.isin}

    golden: list[PriceRow] = []
    quarantine: list[dict] = []
    seen: set[str] = set()

    for isin, n in by_isin_nse.items():
        seen.add(isin)
        b = by_isin_bse.get(isin)
        if b is None:
            golden.append(n)  # NSE-only listing
            continue
        # Compare the four prices; volume legitimately differs per exchange.
        checks = [
            ("open", n.open, b.open),
            ("high", n.high, b.high),
            ("low", n.low, b.low),
            ("close", n.close, b.close),
        ]
        bad = [(field, x, y) for field, x, y in checks if not _agree(x, y)]
        if bad:
            # Disagreement: keep NSE (authoritative, liquid) as golden but log
            # the mismatch for audit. We do NOT drop the scrip — that would hide
            # it from the screener for what is almost always a stale BSE tick.
            golden.append(n)  # tagged plain "NSE" (un-cross-verified)
            quarantine.append(
                {
                    "isin": isin,
                    "date": n.date,
                    "reason": "nse/bse price disagreement (kept NSE, logged for audit)",
                    "payload": {f: {"nse": x, "bse": y} for f, x, y in bad},
                }
            )
        else:
            # Agreement -> cross-verified canonical row.
            golden.append(PriceRow(**{**n.__dict__, "exchange": "NSE+BSE"}))

    # BSE-only listings (not seen on NSE).
    for isin, b in by_isin_bse.items():
        if isin in seen:
            continue
        golden.append(b)

    return golden, quarantine
