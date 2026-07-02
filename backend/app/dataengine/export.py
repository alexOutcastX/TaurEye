"""Publish the market data as compact JSON for on-device consumption.

The mobile/web clients don't talk to a live DB. Instead this module renders the
EOD spine into small static files the client caches and computes against:

  * fundamentals.json — one row per security (name, sector, segment, share
    count, face value). Tiny (~0.1 MB gz); rarely changes.
  * ohlc.json         — a recent corporate-action-ADJUSTED OHLC window for the
    WHOLE universe, packed columnar with a shared date axis. ~13 MB gz for a
    260-day window. This is the "compute indicators on the phone" tier: 260
    trading days is the minimum that reproduces every indicator the screener
    uses today (the 52-week high/low window is candles[-252:], and the
    golden/death-cross check needs one extra day back), so the client can
    recompute the full metric set offline and match the server exactly.
  * candles/<SYMBOL>.json — (opt-in) full per-symbol history for charts,
    fetched on demand.

PARITY: prices are adjusted exactly like providers/db.py — open/high/low are
raw * adj_factor (rounded 4dp), close is adj_close, volume is raw — so indicators
computed on-device match the backend's compute_metrics byte-for-byte.
"""
from __future__ import annotations

import gzip
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA_DIR
from .db import connect

# Default OHLC window. 252 (52-week) + a small buffer for the 1-day-back values
# the cross-detection signals read. 260 keeps every current indicator exact.
DEFAULT_WINDOW = 260

# Where published files land. Sits under the web app's public/ so a normal Vite
# build copies them into dist/, and they can equally be uploaded to a static
# bucket / CDN / nginx. Overridable via --out.
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO_ROOT / "public" / "data"


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _write(path: Path, obj: object, *, gz: bool) -> tuple[int, int]:
    """Write `obj` as compact JSON to `path`; optionally also gzip alongside.
    Returns (raw_bytes, gz_bytes) — gz_bytes is the on-the-wire size whether or
    not a .gz file was written (so the caller can always report transfer cost)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    path.write_bytes(text)
    gz_bytes = len(gzip.compress(text, 6))
    if gz:
        path.with_suffix(path.suffix + ".gz").write_bytes(gzip.compress(text, 9))
    return len(text), gz_bytes


def _symbol(row) -> str:
    return row["nse_symbol"] or row["bse_symbol"] or ""


def export_fundamentals(out: Path, *, gz: bool) -> dict:
    """One compact row per active security with a price history."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT s.isin, s.name, s.nse_symbol, s.bse_symbol, s.sector,
                      s.segment, s.face_value, s.shares_outstanding
               FROM securities s
               WHERE s.active = 1
                 AND EXISTS (SELECT 1 FROM prices p WHERE p.isin = s.isin)
               ORDER BY s.shares_outstanding IS NULL, s.shares_outstanding DESC"""
        ).fetchall()

    securities = []
    for r in rows:
        sym = _symbol(r)
        if not sym:
            continue
        securities.append(
            {
                "s": sym,
                "n": r["name"] or sym,
                "x": "NSE" if r["nse_symbol"] else "BSE",
                "sec": r["sector"] or "Unknown",
                "g": r["segment"],
                "fv": r["face_value"],
                "so": r["shares_outstanding"],
                "isin": r["isin"],
            }
        )

    payload = {
        "meta": {"generated_at": _now(), "count": len(securities)},
        "securities": securities,
    }
    path = out / "fundamentals.json"
    raw, gzb = _write(path, payload, gz=gz)
    print(f"[export] fundamentals: {len(securities)} rows -> {path}"
          f"  ({raw/1e6:.2f} MB raw, {gzb/1e6:.2f} MB gz)")
    return {"file": str(path), "count": len(securities), "raw": raw, "gz": gzb}


def export_metrics(out: Path, *, gz: bool) -> dict:
    """The SCREENER dataset: one precomputed Metrics row per security, plus the
    screener's field definitions and segment counts.

    This is everything the on-device screener filters/sorts on — run_screen reads
    only Metrics attributes, never raw OHLC — so the client screens the whole
    universe instantly and offline against this single small file (~0.5 MB gz).
    Indicators are computed here, server-side, exactly once per nightly run.
    """
    import os
    os.environ.setdefault("TAUREYE_PROVIDER", "db")
    from collections import Counter
    from ..indicators import compute_metrics
    from ..providers.db import DBProvider
    from ..screener import FIELDS

    prov = DBProvider()
    rows = []
    for sec in prov.securities():
        candles = list(prov.history(sec.symbol))
        if candles:
            rows.append(compute_metrics(sec, candles).model_dump())

    _LABELS = {"EQ": "Equity", "ETF": "ETF", "SME": "SME"}
    counts = Counter((m.get("segment") or "EQ") for m in rows)
    segments = [{"key": k, "label": _LABELS.get(k, k), "count": counts[k]}
                for k in sorted(counts, key=lambda k: -counts[k])]

    payload = {
        "meta": {"generated_at": _now(), "count": len(rows)},
        "fields": [f.model_dump() for f in FIELDS],
        "segments": segments,
        "metrics": rows,
    }
    path = out / "metrics.json"
    raw, gzb = _write(path, payload, gz=gz)
    print(f"[export] metrics (screener data): {len(rows)} rows -> {path}"
          f"  ({raw/1e6:.2f} MB raw, {gzb/1e6:.2f} MB gz)")
    return {"file": str(path), "count": len(rows), "raw": raw, "gz": gzb}


def export_ohlc(out: Path, *, window: int, gz: bool) -> dict:
    """Recent ADJUSTED OHLC for the whole universe, packed columnar.

    Layout:
        {
          "meta": {generated_at, window_days, count, adjusted: true},
          "dates": ["YYYY-MM-DD", ...],          # global axis, ascending
          "series": [
            {"s": SYMBOL, "d": [date_idx...],     # indices into "dates"
             "o":[...], "h":[...], "l":[...], "c":[...], "v":[...]},
            ...
          ]
        }
    Per-symbol `d` indexes the shared `dates` axis so symbols that didn't trade
    every day stay aligned without repeating date strings 5,500 times.
    """
    with connect() as conn:
        # The recent global trading-date axis (oldest..newest).
        date_rows = conn.execute(
            "SELECT DISTINCT date FROM prices ORDER BY date DESC LIMIT ?", (window,)
        ).fetchall()
        dates = sorted(r["date"] for r in date_rows)
        if not dates:
            raise SystemExit("No prices in the spine — run `backfill`/`nightly` first.")
        didx = {d: i for i, d in enumerate(dates)}
        start = dates[0]

        sym_of = {}
        for r in conn.execute(
            "SELECT isin, nse_symbol, bse_symbol FROM securities WHERE active=1"
        ).fetchall():
            sym = _symbol(r)
            if sym:
                sym_of[r["isin"]] = sym

        rows = conn.execute(
            """SELECT isin, date, open, high, low, close, volume, adj_factor, adj_close
               FROM prices WHERE date >= ? ORDER BY isin, date""",
            (start,),
        ).fetchall()

    by_isin: dict[str, list] = defaultdict(list)
    for r in rows:
        if r["date"] in didx:
            by_isin[r["isin"]].append(r)

    series = []
    for isin, rs in by_isin.items():
        sym = sym_of.get(isin)
        if not sym:
            continue
        d, o, h, l, c, v = [], [], [], [], [], []
        for r in rs:
            f = r["adj_factor"] or 1.0
            d.append(didx[r["date"]])
            o.append(round(r["open"] * f, 4))
            h.append(round(r["high"] * f, 4))
            l.append(round(r["low"] * f, 4))
            c.append(round(r["adj_close"], 4))
            v.append(int(r["volume"]))
        series.append({"s": sym, "d": d, "o": o, "h": h, "l": l, "c": c, "v": v})

    series.sort(key=lambda s: s["s"])
    payload = {
        "meta": {
            "generated_at": _now(),
            "window_days": len(dates),
            "count": len(series),
            "adjusted": True,
        },
        "dates": dates,
        "series": series,
    }
    path = out / "ohlc.json"
    raw, gzb = _write(path, payload, gz=gz)
    print(f"[export] ohlc: {len(series)} symbols x {len(dates)}d -> {path}"
          f"  ({raw/1e6:.2f} MB raw, {gzb/1e6:.2f} MB gz)")
    return {"file": str(path), "symbols": len(series), "days": len(dates),
            "raw": raw, "gz": gzb}


def export_candles(out: Path, *, gz: bool) -> dict:
    """Full per-symbol ADJUSTED history, one file each, for on-demand charts.

    A scrip that changed ISIN has its regimes stitched into one continuous series
    (see dataengine.merge) so the chart shows the whole history at the live price
    scale — not a frozen or truncated single regime."""
    from .merge import merged_history, symbol_isins

    cdir = out / "candles"
    cdir.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        sym_isins = symbol_isins(conn)
        written = 0
        total_raw = 0
        for sym, isins in sym_isins.items():
            candles = [
                [c["date"], c["open"], c["high"], c["low"], c["close"], c["volume"]]
                for c in merged_history(conn, isins)
            ]
            payload = {"s": sym, "adjusted": True,
                       "cols": ["date", "o", "h", "l", "c", "v"], "candles": candles}
            raw, _ = _write(cdir / f"{sym}.json", payload, gz=gz)
            total_raw += raw
            written += 1
    print(f"[export] candles: {written} per-symbol files -> {cdir}"
          f"  ({total_raw/1e6:.1f} MB raw total)")
    return {"dir": str(cdir), "files": written, "raw": total_raw}


def export_indices(out: Path, *, gz: bool) -> dict:
    """Snapshot the live index ticker (NIFTY / BANK NIFTY / SENSEX / INDIA VIX /
    USD-INR) to a static file.

    The ticker is normally a LIVE feed (NSE/BSE/er-api), so it can't be derived
    from the EOD spine. This writes the last-known values as a small JSON so the
    top bar still shows something useful offline; online clients keep refreshing
    from the live endpoint and fall back to this snapshot when unreachable. Fails
    soft: if every upstream is blocked, an empty `indices` list is still written
    so the client gets a valid (if stale) file rather than a 404."""
    from ..indices import get_indices

    try:
        data = get_indices(force=True)
    except Exception as e:  # never let a flaky upstream abort the whole export
        data = {"indices": [], "as_of": _now(), "error": f"{type(e).__name__}: {e}"}

    # Match /api/indices exactly: it appends the EOD spine date as `data_date`
    # (the "prices as of" stamp the ticker shows). Read the latest price date.
    try:
        with connect() as conn:
            row = conn.execute("SELECT MAX(date) d FROM prices").fetchone()
        data["data_date"] = row["d"] if row else None
    except Exception:
        data["data_date"] = None

    # Stamp WHEN this bundle was published, so the offline app can show "prices
    # last updated on <date> at <time>" (distinct from `as_of`, which in a live
    # client is the moment the ticker was fetched).
    data["generated_at"] = _now()

    path = out / "indices.json"
    raw, gzb = _write(path, data, gz=gz)
    n = len(data.get("indices", []))
    print(f"[export] indices: {n} live values -> {path}"
          f"  ({raw} B raw, {gzb} B gz)")
    return {"file": str(path), "count": n, "raw": raw, "gz": gzb}


def export_fuel(out: Path, *, gz: bool) -> dict:
    """Daily retail fuel prices (India cities + global) scraped from public
    aggregators. Fail-soft: partial or empty data still writes a valid file so
    the app's Fuel tab degrades gracefully rather than 404-ing."""
    try:
        from .fuel import build_fuel_bundle
        data = build_fuel_bundle()
    except Exception as e:  # never abort the export on a flaky scrape
        data = {"meta": {"error": f"{type(e).__name__}: {e}"}, "india": [], "global": []}
    data.setdefault("meta", {})["generated_at"] = _now()
    path = out / "fuel.json"
    raw, gzb = _write(path, data, gz=gz)
    n = len(data.get("india", [])) + len(data.get("global", []))
    print(f"[export] fuel: {n} rows -> {path}  ({raw} B raw, {gzb} B gz)")
    return {"file": str(path), "count": n, "raw": raw, "gz": gzb}


def export_reports(out: Path, *, gz: bool, top_n: int | None = None) -> dict:
    """Per-stock templated reports (ZERO LLM cost) → reports/<SYMBOL>.json, read
    from the just-written metrics.json so computed indicators are reused. Served
    on demand like candles; the ai-report Edge Function is the fallback for any
    symbol without a cached file. top_n caps to the largest caps (None = all EQ)."""
    import json
    from .report import build_report
    rdir = out / "reports"
    rdir.mkdir(parents=True, exist_ok=True)
    try:
        with open(out / "metrics.json") as f:
            rows = json.load(f).get("metrics") or []
    except Exception as e:  # noqa: BLE001
        print(f"[export] reports: FAIL reading metrics.json: {type(e).__name__}: {e}")
        return {"dir": str(rdir), "count": 0}
    eq = [m for m in rows if (m.get("segment") or "EQ") == "EQ" and m.get("symbol")]
    if top_n:
        eq.sort(key=lambda m: (m.get("market_cap_cr") or 0), reverse=True)
        eq = eq[:top_n]
    written = 0
    for m in eq:
        _write(rdir / f"{m['symbol']}.json", build_report(m), gz=gz)
        written += 1
    print(f"[export] reports: {written} templated reports -> {rdir}")
    return {"dir": str(rdir), "count": written}


def export_dividends(out: Path, *, gz: bool, years: int = 3) -> dict:
    """Per-symbol cash dividends (₹/share by ex_date) so the portfolio can show
    total return. Sparse, so one consolidated file keyed by NSE symbol."""
    from datetime import date, timedelta
    cutoff = (date.today() - timedelta(days=365 * years)).isoformat()
    by_sym: dict[str, list] = {}
    try:
        with connect() as conn:
            rows = conn.execute(
                """SELECT s.nse_symbol AS sym, d.ex_date AS ex, d.amount AS amt
                   FROM dividends d JOIN securities s ON s.isin = d.isin
                   WHERE s.nse_symbol IS NOT NULL AND d.ex_date >= ?
                   ORDER BY s.nse_symbol, d.ex_date""",
                (cutoff,),
            ).fetchall()
        for r in rows:
            by_sym.setdefault(r["sym"], []).append([r["ex"], round(r["amt"], 4)])
    except Exception as e:  # noqa: BLE001
        print(f"[export] dividends: FAIL {type(e).__name__}: {e} (writing empty)")
    payload = {"generated_at": _now(), "dividends": by_sym}
    path = out / "dividends.json"
    raw, gzb = _write(path, payload, gz=gz)
    n = sum(len(v) for v in by_sym.values())
    print(f"[export] dividends: {n} events across {len(by_sym)} symbols -> {path}"
          f"  ({raw} B raw, {gzb} B gz)")
    return {"file": str(path), "count": n, "raw": raw, "gz": gzb}


def write_manifest(out: Path, files: dict, *, window: int, gz: bool) -> dict:
    """Write manifest.json describing the published bundle.

    The client fetches this first (from its configured data base URL) to learn
    what's available, the OHLC window length, and when the bundle was generated —
    so it can cache-bust and degrade gracefully when an optional file is absent.

    Paths are stored RELATIVE to the bundle root (just the filename / subdir), so
    the manifest is portable across hosts and never leaks a local build path.
    """
    def _rel(entry: dict) -> dict:
        e = dict(entry)
        for k in ("file", "dir"):
            if k in e:
                try:
                    e[k] = Path(e[k]).relative_to(out).as_posix()
                except ValueError:
                    e[k] = Path(e[k]).name
        return e

    payload = {
        "generated_at": _now(),
        "window_days": window,
        "gzip": gz,
        "files": {k: _rel(v) for k, v in files.items()},
    }
    path = out / "manifest.json"
    raw, gzb = _write(path, payload, gz=gz)
    print(f"[export] manifest: {len(files)} artifact(s) -> {path}")
    return {"file": str(path), "raw": raw, "gz": gzb}


def export_funda(out: Path, *, gz: bool) -> dict:
    """Per-symbol fundamentals for the stock report: corporate actions (already
    in the spine — reliable today) plus financial results, shareholding and
    recent filings (populated by `run funda`). Only securities with at least one
    such record get a file, keeping the fan-out lean. Written to funda/<SYMBOL>.json."""
    fdir = out / "funda"
    fdir.mkdir(parents=True, exist_ok=True)

    def group(sql: str):
        d = defaultdict(list)
        for r in conn.execute(sql):
            d[r["isin"]].append({k: r[k] for k in r.keys() if k != "isin"})
        return d

    with connect() as conn:
        secs = conn.execute(
            "SELECT isin, name, nse_symbol, bse_symbol, sector, segment, about "
            "FROM securities WHERE active=1"
        ).fetchall()
        ca = group("SELECT isin, ex_date, kind, ratio, detail FROM corporate_actions "
                   "ORDER BY ex_date DESC")
        fin = group("SELECT isin, period_end, period_type, consolidated, revenue, "
                    "other_income, expenses, interest, depreciation, pbt, tax, "
                    "net_profit, eps FROM financials ORDER BY period_end DESC")
        bs = group("SELECT isin, period_end, period_type, total_assets, total_liab, "
                   "total_debt, long_term_debt, short_term_debt, cash, net_debt, "
                   "equity, net_working_capital FROM balance_sheets "
                   "ORDER BY period_end DESC")
        shp = group("SELECT isin, period_end, promoter_pct, promoter_pledge_pct, "
                    "public_pct, fii_pct, dii_pct FROM shareholding ORDER BY period_end DESC")
        ann = group("SELECT isin, dt, category, headline, url FROM announcements "
                    "ORDER BY dt DESC")

    written = 0
    raw_tot = gz_tot = 0
    for s in secs:
        isin = s["isin"]
        sym = _symbol(s)
        if not sym:
            continue
        actions, financials, holding, news = ca.get(isin), fin.get(isin), shp.get(isin), ann.get(isin)
        sheets = bs.get(isin)
        if not (actions or financials or holding or news or sheets):
            continue
        payload = {
            "s": sym,
            "n": s["name"] or sym,
            "sec": s["sector"] or "Unknown",
            "isin": isin,
            "about": s["about"],
            "generated_at": _now(),
            "corporate_actions": (actions or [])[:40],
            "financials": (financials or [])[:16],
            "balance_sheets": (sheets or [])[:12],
            "shareholding": (holding or [])[:8],
            "announcements": (news or [])[:40],
        }
        raw, gzb = _write(fdir / f"{sym}.json", payload, gz=gz)
        raw_tot += raw
        gz_tot += gzb
        written += 1

    print(f"[export] funda: {written} per-symbol files -> {fdir}"
          f"  ({raw_tot/1e6:.2f} MB raw, {gz_tot/1e6:.2f} MB gz)")
    return {"dir": "funda", "count": written, "raw": raw_tot, "gz": gz_tot}


def cmd_export(out: str | None, *, window: int, gz: bool,
               fundamentals: bool, metrics: bool, ohlc: bool, candles: bool,
               indices: bool = False, everything: bool = False, funda: bool = False,
               fuel: bool = False) -> None:
    """Dispatch. With no specific flag, export the lightweight client bundle —
    fundamentals + metrics + indices (the screener data + ticker snapshot, ~0.7
    MB gz total). The big universe-wide ohlc.json and the per-symbol candles/
    fan-out are opt-in, since charts fetch candles on demand and screening needs
    only metrics.

    `--all` publishes the COMPLETE cloud bundle the mobile app runs on:
    fundamentals + metrics + indices + per-symbol candles (charts fetch these on
    demand, so no single huge file). The monolithic ohlc.json stays separate —
    it's only for clients that want the whole-universe window in one request.

    A manifest.json is always written, listing every artifact produced so the
    client can discover the bundle from one fetch."""
    out_dir = Path(out) if out else DEFAULT_OUT
    if everything:
        fundamentals = metrics = indices = candles = fuel = True
    if not (fundamentals or metrics or ohlc or candles or indices):
        # default = the on-device screener bundle + ticker snapshot
        fundamentals = metrics = indices = True

    t0 = datetime.now()
    files: dict = {}
    if fundamentals:
        files["fundamentals"] = export_fundamentals(out_dir, gz=gz)
    if metrics:
        files["metrics"] = export_metrics(out_dir, gz=gz)
        files["dividends"] = export_dividends(out_dir, gz=gz)
        files["reports"] = export_reports(out_dir, gz=gz)
    if indices:
        files["indices"] = export_indices(out_dir, gz=gz)
    if fuel:
        files["fuel"] = export_fuel(out_dir, gz=gz)
    if ohlc:
        files["ohlc"] = export_ohlc(out_dir, window=window, gz=gz)
    if candles:
        files["candles"] = export_candles(out_dir, gz=gz)
    if funda:
        files["funda"] = export_funda(out_dir, gz=gz)
    write_manifest(out_dir, files, window=window, gz=gz)
    dt = (datetime.now() - t0).total_seconds()
    print(f"[export] done in {dt:.1f}s -> {out_dir}")
