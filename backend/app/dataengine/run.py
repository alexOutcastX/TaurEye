"""CLI for the EOD data engine.

Examples (run from the repo root with the backend venv active):

  # Full nightly run for the most recent trading day:
  python -m backend.app.dataengine.run nightly

  # A specific date (after a holiday, or to backfill):
  python -m backend.app.dataengine.run nightly --date 2026-05-29

  # Individual stages:
  python -m backend.app.dataengine.run master
  python -m backend.app.dataengine.run corp-actions
  python -m backend.app.dataengine.run eod --date 2026-05-29
  python -m backend.app.dataengine.run readjust

  # Health / audit:
  python -m backend.app.dataengine.run status

  # Offline self-test (no network) — proves reconcile + adjust math:
  python -m backend.app.dataengine.run selftest
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta

from . import ingest
from .db import init_db, session


def _prev_trading_day(today: date | None = None) -> date:
    d = (today or date.today()) - timedelta(days=1)
    while d.weekday() >= 5:   # skip Sat/Sun (holidays still attempted; will 404)
        d -= timedelta(days=1)
    return d


def _parse_date(s: str | None) -> date:
    if not s:
        return _prev_trading_day()
    return datetime.strptime(s, "%Y-%m-%d").date()


def _trading_days_back(n: int, today: date | None = None) -> list[date]:
    """The last `n` weekdays ending at the previous trading day, oldest first.
    Holidays are still included (their fetch just fails gracefully = empty day)."""
    d = _prev_trading_day(today)
    out: list[date] = []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return list(reversed(out))


def cmd_backfill(days: int) -> None:
    """Populate history for the last `days` trading days so indicators that need
    a long window (RSI-14, SMA-50/200, 52-week, rel-volume) become meaningful.

    Master + corporate actions are refreshed once up front; then each trading
    day's EOD is ingested (idempotent + cached, so re-running is safe); finally a
    single full readjust keeps adjusted prices continuous across the whole range.
    """
    init_db()
    dates = _trading_days_back(days)
    ingest.log(f"BACKFILL start  days={days}  range={dates[0].isoformat()}..{dates[-1].isoformat()}")

    try:
        n = ingest.update_master()
        ingest.log(f"  master        securities={n}")
    except Exception as e:
        ingest.log(f"  master        FAIL {type(e).__name__}: {e} (continuing)")
    try:
        # Span corporate actions across the WHOLE backfill range so splits/bonuses
        # in the older history adjust correctly (not just the last ~460 days).
        n = ingest.update_corporate_actions(start=dates[0])
        ingest.log(f"  corp_actions  count={n}")
    except Exception as e:
        ingest.log(f"  corp_actions  FAIL {type(e).__name__}: {e} (continuing)")
    ok = 0
    empty = 0
    for d in dates:
        res = ingest.ingest_eod(d)
        if res["status"] == "error":
            empty += 1
        else:
            ok += 1
        print(f"  {d.isoformat()}  {res['status']:<7} golden={res['golden']} "
              f"nse={res['nse']} bse={res['bse']}")

    try:
        ingest.readjust()
    except Exception as e:
        ingest.log(f"  readjust      FAIL {type(e).__name__}: {e}")

    # Classify segments AFTER every day's EOD has upserted its scrips, so funds/
    # ETFs that only appear in older bhavcopies get tagged (not left NULL).
    try:
        seg = ingest.update_segments()
        ingest.log(f"  segments      EQ={seg['EQ']} ETF={seg['ETF']} SME={seg['SME']}")
    except Exception as e:
        ingest.log(f"  segments      FAIL {type(e).__name__}: {e} (continuing)")

    ingest.log(f"BACKFILL done  days_with_data={ok}/{len(dates)} empty={empty}")
    cmd_status()


def cmd_status() -> None:
    init_db()
    with session() as conn:
        sec = conn.execute("SELECT COUNT(*) c FROM securities").fetchone()["c"]
        active = conn.execute(
            "SELECT COUNT(*) c FROM securities WHERE active=1"
        ).fetchone()["c"]
        shares = conn.execute(
            "SELECT COUNT(*) c FROM securities WHERE shares_outstanding IS NOT NULL AND active=1"
        ).fetchone()["c"]
        px = conn.execute("SELECT COUNT(*) c FROM prices").fetchone()["c"]
        days = conn.execute("SELECT COUNT(DISTINCT date) c FROM prices").fetchone()["c"]
        q = conn.execute("SELECT COUNT(*) c FROM quarantine").fetchone()["c"]
        ca = conn.execute("SELECT COUNT(*) c FROM corporate_actions").fetchone()["c"]
        segs = conn.execute(
            "SELECT COALESCE(segment,'(unclassified)') s, COUNT(*) c "
            "FROM securities WHERE active=1 GROUP BY segment ORDER BY c DESC"
        ).fetchall()
        last = conn.execute(
            "SELECT trade_date,stage,status,rows,quarantined,ended_at"
            " FROM ingest_runs ORDER BY id DESC LIMIT 5"
        ).fetchall()
    print(f"securities : {sec}")
    print(f"market cap : {shares}/{active} active scrips have share counts "
          f"(BSE bulk feed, joined by ISIN; rest show '-')")
    print(f"segments   : " + ", ".join(f"{r['s']}={r['c']}" for r in segs))
    print(f"prices     : {px} rows across {days} trading days")
    print(f"corp acts  : {ca}")
    print(f"quarantine : {q}")
    print("recent runs:")
    for r in last:
        print(f"  {r['ended_at']}  {r['stage']:<12} {r['status']:<7} "
              f"date={r['trade_date']} rows={r['rows']} q={r['quarantined']}")


def cmd_logs(n: int = 30) -> None:
    """Print the last n lines of the engine log."""
    from .config import LOG_PATH
    if not LOG_PATH.exists():
        print(f"(no log yet at {LOG_PATH})")
        return
    lines = LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()
    for line in lines[-n:]:
        print(line)


def cmd_selftest() -> None:
    """Validate reconcile + adjustment math with synthetic rows (no network)."""
    from .reconcile import reconcile
    from .adjust import apply_adjustments
    from .types import CorpAction, PriceRow

    # --- reconcile: one agreeing ISIN, one disagreeing ---
    nse = [
        PriceRow("INE001", "AAA", "2026-05-29", 100, 105, 99, 104, 1000, "NSE"),
        PriceRow("INE002", "BBB", "2026-05-29", 50, 52, 49, 51, 2000, "NSE"),
    ]
    bse = [
        PriceRow("INE001", "AAA", "2026-05-29", 100.1, 105.2, 98.9, 104.2, 900, "BSE"),
        PriceRow("INE002", "BBB", "2026-05-29", 50, 52, 49, 61, 1800, "BSE"),  # close way off
    ]
    golden, q = reconcile(nse, bse)
    gmap = {r.isin: r for r in golden}
    # AAA agrees -> cross-verified; BBB disagrees -> NSE kept as golden + logged.
    assert len(golden) == 2, golden
    assert gmap["INE001"].exchange == "NSE+BSE", gmap["INE001"]
    assert gmap["INE002"].exchange == "NSE", gmap["INE002"]
    assert len(q) == 1 and q[0]["isin"] == "INE002", q
    print("reconcile: OK  (AAA agreed -> NSE+BSE; BBB disagreed -> NSE kept + audit-logged)")

    # --- adjust: a 1:1 bonus halves all PRE-ex closes ---
    rows = [
        PriceRow("INE001", "AAA", "2026-05-01", 0, 0, 0, 200, 0, "NSE"),
        PriceRow("INE001", "AAA", "2026-05-15", 0, 0, 0, 100, 0, "NSE"),  # ex-date
    ]
    cas = [CorpAction("INE001", "2026-05-15", "bonus", 0.5, "Bonus 1:1", "NSE")]
    adj = apply_adjustments(rows, cas)
    pre, post = adj[0], adj[1]
    assert abs(pre["adj_close"] - 100.0) < 1e-6, pre      # 200 * 0.5
    assert abs(post["adj_close"] - 100.0) < 1e-6, post    # 100 * 1.0
    print("adjust:    OK  (1:1 bonus -> pre-ex 200 back-adjusts to 100, continuous)")
    print("selftest:  ALL PASSED")


def main() -> None:
    p = argparse.ArgumentParser(prog="dataengine", description="TaurEye EOD data engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("nightly", "eod"):
        sp = sub.add_parser(name)
        sp.add_argument("--date", help="YYYY-MM-DD (default: previous weekday)")
    bp = sub.add_parser("backfill")
    bp.add_argument("--days", type=int, default=300,
                    help="trading days of history to pull (default 300 ≈ 14 months)")
    sub.add_parser("master")
    sub.add_parser("corp-actions")
    sub.add_parser("segments")
    mp = sub.add_parser("marketcap")
    mp.add_argument("--limit", type=int, default=None,
                    help="cap how many symbols to fetch this run (default: all due)")
    mp.add_argument("--all", action="store_true",
                    help="refetch every NSE symbol, ignoring how recent the stored count is")
    mp.add_argument("--max-age-days", type=int, default=30,
                    help="refresh counts older than this many days (default 30)")
    pp = sub.add_parser("marketcap-probe")
    pp.add_argument("symbol", nargs="?", default="RELIANCE",
                    help="NSE symbol to diagnose (default RELIANCE)")
    fp = sub.add_parser("funda", help="fetch fundamentals (financials, shareholding, filings)")
    fp.add_argument("--limit", type=int, default=None,
                    help="cap how many symbols to fetch this run (default: all due)")
    fp.add_argument("--all", action="store_true",
                    help="refetch every BSE-listed symbol, ignoring recency")
    fp.add_argument("--max-age-days", type=int, default=7,
                    help="refetch fundamentals older than this many days (default 7)")
    fpp = sub.add_parser("funda-probe", help="print raw BSE fundamentals JSON for one symbol")
    fpp.add_argument("symbol", nargs="?", default="RELIANCE")
    sub.add_parser("readjust")
    sub.add_parser("status")
    sub.add_parser("selftest")
    lp = sub.add_parser("logs")
    lp.add_argument("-n", type=int, default=30, help="lines to show (default 30)")
    xp = sub.add_parser("export", help="publish compact JSON (fundamentals + OHLC) for clients")
    xp.add_argument("--out", default=None,
                    help="output dir (default: public/data)")
    xp.add_argument("--days", type=int, default=260,
                    help="OHLC window in trading days (default 260 ≈ 52w + cross buffer)")
    xp.add_argument("--fundamentals", action="store_true", help="export fundamentals.json only")
    xp.add_argument("--metrics", action="store_true",
                    help="export metrics.json only (the screener dataset)")
    xp.add_argument("--ohlc", action="store_true",
                    help="export ohlc.json (big: whole-universe raw OHLC window)")
    xp.add_argument("--candles", action="store_true",
                    help="also write per-symbol full-history candle files (large)")
    xp.add_argument("--funda", action="store_true",
                    help="write per-symbol fundamentals files (corp actions + financials + shareholding)")
    xp.add_argument("--indices", action="store_true",
                    help="export indices.json (live ticker snapshot for offline)")
    xp.add_argument("--all", dest="everything", action="store_true",
                    help="publish the COMPLETE cloud bundle: fundamentals + metrics "
                         "+ indices + per-symbol candles (charts fetch on demand)")
    xp.add_argument("--gz", action="store_true",
                    help="also write .gz alongside each .json (for dumb static hosts)")

    args = p.parse_args()
    if args.cmd == "nightly":
        print(ingest.run_nightly(_parse_date(args.date)))
    elif args.cmd == "eod":
        print(ingest.ingest_eod(_parse_date(args.date)))
    elif args.cmd == "backfill":
        cmd_backfill(args.days)
    elif args.cmd == "master":
        print({"securities": ingest.update_master()})
    elif args.cmd == "corp-actions":
        print({"corp_actions": ingest.update_corporate_actions()})
    elif args.cmd == "segments":
        print(ingest.update_segments())
    elif args.cmd == "marketcap":
        from . import marketcap
        print(marketcap.enrich_shares(
            limit=args.limit, refresh_all=args.all, max_age_days=args.max_age_days))
    elif args.cmd == "marketcap-probe":
        from . import marketcap
        marketcap.probe(args.symbol)
    elif args.cmd == "funda":
        from . import funda
        print(funda.update_fundamentals(
            limit=args.limit, refresh_all=args.all, max_age_days=args.max_age_days))
    elif args.cmd == "funda-probe":
        from . import funda
        funda.probe(args.symbol)
    elif args.cmd == "readjust":
        print({"readjusted_isins": ingest.readjust()})
    elif args.cmd == "status":
        cmd_status()
    elif args.cmd == "selftest":
        cmd_selftest()
    elif args.cmd == "logs":
        cmd_logs(args.n)
    elif args.cmd == "export":
        from .export import cmd_export
        cmd_export(args.out, window=args.days, gz=args.gz,
                   fundamentals=args.fundamentals, metrics=args.metrics,
                   ohlc=args.ohlc, candles=args.candles,
                   indices=args.indices, everything=args.everything, funda=args.funda)


if __name__ == "__main__":
    main()
