"""Market-cap enrichment — fills securities.shares_outstanding from real data.

Market cap = close price x issued shares. The bhavcopy spine carries prices but
NO share count, so without this step the screener has nothing real to multiply.

Source: BSE's bulk `ListofScripData` API. It returns the entire active equity
universe in ONE call, each row carrying ISIN_NUMBER + Mktcap (already in Rs
crore). We turn that authoritative cap back into a share COUNT using the spine's
latest close (shares = cap_cr * 1e7 / close) and store it in
`securities.shares_outstanding`. Storing shares (rather than the cap directly)
means market cap then tracks the spine's daily close for free — exactly the
textbook definition price x shares — and reuses the whole existing null-safe
pipeline (provider -> indicators -> screener -> UI) unchanged.

Why BSE and not NSE: NSE's per-symbol quote API (securityInfo.issuedSize) is
hard-blocked by Akamai Bot Manager (it needs a validated _abck cookie that only
a real browser sensor-data POST produces). The BSE bulk feed has no bot wall and,
because caps are keyed by ISIN, it covers NSE-listed names too via shared ISIN.
NSE-exclusive scrips not present on BSE keep shares_outstanding = NULL and the UI
shows "—" rather than a fabricated number.
"""
from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from . import sources
from .db import init_db, session


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stale(shares_at: str | None, max_age_days: int) -> bool:
    """True if a stored count is missing or older than max_age_days."""
    if not shares_at:
        return True
    try:
        ts = datetime.fromisoformat(shares_at)
    except ValueError:
        return True
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).days >= max_age_days


def probe(symbol: str = "RELIANCE") -> None:
    """Diagnose the market-cap source: confirm the BSE bulk feed is reachable and
    print the cap it carries for one symbol (matched by NSE symbol via the DB).

    Also exercises the (best-effort) NSE quote path so we can still see why it
    fails (Akamai 403) without it blocking anything.
    """
    print(f"[probe] symbol={symbol}")
    caps = sources.bse_all_market_caps()
    print(f"  BSE ListofScripData -> {len(caps)} ISINs with Mktcap (Rs crore)")
    if caps:
        sample = list(caps.items())[:3]
        print(f"  sample: {sample}")

    init_db()
    with session() as conn:
        row = conn.execute(
            "SELECT isin, nse_symbol, bse_symbol FROM securities WHERE nse_symbol=? OR bse_symbol=?",
            (symbol, symbol),
        ).fetchone()
    if not row:
        print(f"  (symbol {symbol} not found in securities)")
        return
    isin = row["isin"]
    cap = caps.get(isin)
    print(f"  {symbol}  isin={isin}  BSE market cap = "
          f"{cap if cap is not None else 'NONE'} crore")


def enrich_shares(
    limit: int | None = None,
    refresh_all: bool = False,
    max_age_days: int = 30,
    delay: float = 0.0,  # kept for signature compat; bulk source needs no pacing
    progress: bool = True,
) -> dict:
    """Fill securities.shares_outstanding from the BSE bulk market-cap feed.

    One HTTP call fetches caps for the whole universe; we then derive a share
    count per security from its latest spine close and store it. By default only
    rows missing a count or older than `max_age_days` are touched (cheap re-runs);
    pass refresh_all=True to recompute every row.

    Returns {universe, candidates, updated, failed}: `universe` = caps fetched
    from BSE, `candidates` = securities considered, `updated` = counts written,
    `failed` = securities with no matching cap or no usable close.
    """
    init_db()
    caps = sources.bse_all_market_caps()
    universe = len(caps)
    if not universe:
        if progress:
            print("  [marketcap] BSE feed returned no rows (network blocked?) - "
                  "leaving share counts unchanged.")
        return {"universe": 0, "candidates": 0, "updated": 0, "failed": 0}

    with session() as conn:
        rows = conn.execute(
            "SELECT s.isin, s.shares_at, "
            "(SELECT p.close FROM prices p WHERE p.isin = s.isin "
            " ORDER BY p.date DESC LIMIT 1) AS last_close "
            "FROM securities s WHERE active=1"
        ).fetchall()

    targets = [r for r in rows if refresh_all or _stale(r["shares_at"], max_age_days)]
    if limit is not None:
        targets = targets[:limit]

    total = len(targets)
    show = progress and total > 0 and sys.stdout.isatty()
    if progress:
        print(f"  [marketcap] BSE universe={universe} caps; "
              f"resolving {total} securities...")

    started = time.monotonic()
    updated = 0
    failed = 0
    for i, r in enumerate(targets):
        cap_cr = caps.get(r["isin"])
        close = r["last_close"]
        if cap_cr and close and close > 0:
            shares = cap_cr * 1e7 / close   # cap_cr crore -> rupees, / price = shares
            with session() as conn:
                conn.execute(
                    "UPDATE securities SET shares_outstanding=?, shares_src=?, "
                    "shares_at=?, updated_at=? WHERE isin=?",
                    (shares, "BSE", _now(), _now(), r["isin"]),
                )
            updated += 1
        else:
            failed += 1
        if show:
            sys.stdout.write(_bar(i + 1, total, updated, failed, started))
            sys.stdout.flush()

    if show:
        sys.stdout.write("\n")
        sys.stdout.flush()
    if progress:
        print(f"  [marketcap] done: updated={updated} unmatched={failed} "
              f"(of {total} candidates; {universe} BSE caps available)")

    return {"universe": universe, "candidates": total,
            "updated": updated, "failed": failed}


def _bar(done: int, total: int, updated: int, failed: int, started: float) -> str:
    """Render a single-line ASCII progress bar (overwritten in place with \\r).

    ASCII only: the Windows console defaults to cp1252, where box-drawing glyphs
    raise UnicodeEncodeError and would crash the run.
    """
    width = 28
    frac = done / total if total else 1.0
    fill = int(width * frac)
    bar = "#" * fill + "-" * (width - fill)
    elapsed = time.monotonic() - started
    rate = done / elapsed if elapsed > 0 else 0
    eta = (total - done) / rate if rate > 0 else 0
    mm, ss = divmod(int(eta), 60)
    return (f"\r  [{bar}] {done}/{total} {frac*100:4.0f}%  "
            f"ok={updated} miss={failed}  ETA {mm:d}m{ss:02d}s ")
