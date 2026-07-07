"""Ingest orchestration — the nightly pipeline.

Stages (each recorded in ingest_runs for auditability):
  1. update_master           NSE EQUITY_L -> securities (canonical ISIN map)
  2. update_corporate_actions NSE CA feed -> corporate_actions
  3. ingest_eod(date)        NSE+BSE bhavcopy -> reconcile -> prices / quarantine
  4. readjust(isins)         recompute adj_close across full history

The whole thing is idempotent per trading date: re-running uses the cached raw
files and upserts, so a re-run never duplicates or corrupts rows.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from . import sources
from .adjust import apply_adjustments
from .config import LOG_PATH, ensure_dirs
from .db import init_db, session
from .reconcile import reconcile
from .types import CorpAction, PriceRow


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(msg: str) -> None:
    """Append a timestamped line to data/engine.log (and echo to stdout).

    Gives unattended scheduled runs an audit trail you can glance at without
    opening the DB. Never raises — logging must not break an ingest.
    """
    line = f"{_now()}  {msg}"
    print(line)
    try:
        ensure_dirs()
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def _record(conn, trade_date: str, stage: str, status: str, rows: int = 0,
            quarantined: int = 0, message: str = "", started: str | None = None) -> None:
    conn.execute(
        "INSERT INTO ingest_runs(trade_date,stage,status,rows,quarantined,message,started_at,ended_at)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (trade_date, stage, status, rows, quarantined, message, started or _now(), _now()),
    )


# ---------- stage 1: security master ----------
def update_master() -> int:
    started = _now()
    init_db()
    rows = sources.nse_equity_master()
    with session() as conn:
        for m in rows:
            conn.execute(
                """INSERT INTO securities(isin,name,nse_symbol,series,face_value,listed_on,active,updated_at)
                   VALUES (?,?,?,?,?,?,1,?)
                   ON CONFLICT(isin) DO UPDATE SET
                     name=excluded.name, nse_symbol=excluded.nse_symbol,
                     series=excluded.series, face_value=excluded.face_value,
                     listed_on=excluded.listed_on, active=1, updated_at=excluded.updated_at""",
                (m.isin, m.name, m.nse_symbol, m.series, m.face_value, m.listed_on, _now()),
            )
        # Retire superseded ISINs: when a scrip changes ISIN (e.g. a face-value
        # split mints a new ISIN), the master maps the symbol to the NEW ISIN but
        # the OLD ISIN row lingers as active=1 with the same nse_symbol. Two active
        # rows for one symbol make the exporter write the per-symbol candle/metrics
        # file twice and the stale one can win — freezing that stock's price/chart.
        # The current NSE master is authoritative, so deactivate any other active
        # row carrying a symbol we just mapped to a different ISIN.
        for m in rows:
            conn.execute(
                "UPDATE securities SET active=0, updated_at=? "
                "WHERE nse_symbol=? AND isin<>?",
                (_now(), m.nse_symbol, m.isin),
            )
        _record(conn, "-", "master", "ok", rows=len(rows), started=started)
    return len(rows)


def _upsert_bse_master(conn, bse_rows: list[PriceRow]) -> None:
    """Capture BSE symbol on the canonical security via ISIN (keep existing name)."""
    for r in bse_rows:
        if not r.isin:
            continue
        conn.execute(
            """INSERT INTO securities(isin,name,bse_symbol,active,updated_at)
               VALUES (?,?,?,1,?)
               ON CONFLICT(isin) DO UPDATE SET
                 bse_symbol=excluded.bse_symbol, updated_at=excluded.updated_at""",
            (r.isin, r.name or r.symbol, r.symbol, _now()),
        )


def _upsert_nse_master(conn, nse_rows: list[PriceRow]) -> None:
    """Ensure every NSE-priced ISIN has a master row, so scrips outside the
    EQ-only EQUITY_L list (BE/SM/ST series) are still visible to the screener.
    Existing names from EQUITY_L are preserved; new ISINs get the bhavcopy name."""
    for r in nse_rows:
        if not r.isin:
            continue
        conn.execute(
            """INSERT INTO securities(isin,name,nse_symbol,active,updated_at)
               VALUES (?,?,?,1,?)
               ON CONFLICT(isin) DO UPDATE SET
                 nse_symbol=excluded.nse_symbol, updated_at=excluded.updated_at""",
            (r.isin, r.name or r.symbol, r.symbol, _now()),
        )


def _nse_symbol_to_isin(conn) -> dict[str, str]:
    cur = conn.execute("SELECT nse_symbol, isin FROM securities WHERE nse_symbol IS NOT NULL")
    return {row["nse_symbol"]: row["isin"] for row in cur.fetchall()}


# ---------- segment classification (EQ / ETF / SME) ----------
def update_segments() -> dict:
    """Classify every active security into a segment so the screener can
    include/exclude instrument types (e.g. drop ETFs).

    Rules, most-specific first:
      * ETF  — ISIN is in NSE's published ETF list, OR the ISIN is an INF-series
               (mutual-fund/ETF unit; equities are INE-series), OR the symbol
               ends in ETF/BEES (catches BSE ETFs the NSE list misses).
      * SME  — listed under an SME series (SM/ST).
      * EQ   — everything else (ordinary cash equity); the safe default.
    Name matching is deliberately avoided (e.g. "JETFREIGHT" contains "ETF").
    """
    init_db()
    etf_isins = sources.nse_etf_list()
    counts: dict[str, int] = {"EQ": 0, "ETF": 0, "SME": 0}
    with session() as conn:
        rows = conn.execute(
            "SELECT isin, nse_symbol, bse_symbol, series, name FROM securities WHERE active=1"
        ).fetchall()
        for r in rows:
            isin = (r["isin"] or "").strip()
            sym = (r["nse_symbol"] or r["bse_symbol"] or "").upper()
            series = (r["series"] or "").upper()
            name = (r["name"] or "").upper()
            if (isin in etf_isins or isin.startswith("INF")
                    or sym.endswith("ETF") or sym.endswith("BEES")
                    or "MUTUAL FUND" in name or name.endswith(" ETF") or " ETF " in name):
                # INF-series ISINs are mutual-fund/ETF units (equities are INE);
                # the name/symbol checks catch BSE funds the NSE list omits.
                seg = "ETF"
            elif series in {"SM", "ST"}:
                seg = "SME"
            else:
                seg = "EQ"
            counts[seg] += 1
            conn.execute(
                "UPDATE securities SET segment=?, updated_at=? WHERE isin=?",
                (seg, _now(), r["isin"]),
            )
    return counts


# NSE sectoral index -> human sector label. Order matters: a stock that appears
# in several indices is tagged by the FIRST (most specific) match, so e.g. an IT
# name isn't swallowed by the broad "Financial Services"/"Banking" buckets.
_SECTOR_INDICES: list[tuple[str, str]] = [
    ("NIFTY IT", "IT"),
    ("NIFTY PHARMA", "Pharma"),
    ("NIFTY HEALTHCARE INDEX", "Healthcare"),
    ("NIFTY FMCG", "FMCG"),
    ("NIFTY AUTO", "Automobile"),
    ("NIFTY METAL", "Metals"),
    ("NIFTY OIL & GAS", "Oil & Gas"),
    ("NIFTY ENERGY", "Energy"),
    ("NIFTY REALTY", "Realty"),
    ("NIFTY MEDIA", "Media"),
    ("NIFTY CONSUMER DURABLES", "Consumer Durables"),
    ("NIFTY INFRASTRUCTURE", "Infrastructure"),
    ("NIFTY PSU BANK", "PSU Bank"),
    ("NIFTY PRIVATE BANK", "Banking"),
    ("NIFTY BANK", "Banking"),
    ("NIFTY FINANCIAL SERVICES", "Financial Services"),
]


# NSE "Industry" (macro sector) labels → the short names shown in the app's
# sector heatmap. Unmapped labels pass through verbatim.
_INDUSTRY_LABEL = {
    "Information Technology": "IT",
    "Fast Moving Consumer Goods": "FMCG",
    "Oil Gas & Consumable Fuels": "Oil & Gas",
    "Metals & Mining": "Metals",
    "Automobile and Auto Components": "Automobile",
    "Media Entertainment & Publication": "Media",
    "Telecommunication": "Telecom",
}

# niftyindices.com publishes plain constituent CSVs (Company Name, Industry,
# Symbol, Series, ISIN). Unlike the nseindia.com JSON API these are not behind
# Akamai bot management, so they work from datacenter IPs. Total-market covers
# ~750 names; nifty500 is the backup.
_NIFTYINDICES_CSVS = [
    "https://niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv",
    "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv",
]


def _sectors_from_csv() -> dict[str, str]:
    """Fallback sector map when the NSE JSON API is bot-blocked (the normal
    case from cloud/datacenter IPs): symbol -> sector from the niftyindices
    constituent CSVs' Industry column."""
    import csv
    import io

    from .http import get_session

    for url in _NIFTYINDICES_CSVS:
        name = url.rsplit("/", 1)[-1]
        try:
            r = get_session().get(url, timeout=20, headers={"Referer": "https://niftyindices.com/"})
            if r.status_code != 200 or not r.text or r.text.lstrip().startswith("<"):
                log(f"  sectors       csv {name}: HTTP {r.status_code} (skipped)")
                continue
            out: dict[str, str] = {}
            for row in csv.DictReader(io.StringIO(r.text)):
                cells = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
                sym = cells.get("symbol", "").upper()
                industry = cells.get("industry", "")
                if sym and industry:
                    out[sym] = _INDUSTRY_LABEL.get(industry, industry)
            if out:
                log(f"  sectors       csv fallback {name}: {len(out)} symbols")
                return out
            log(f"  sectors       csv {name}: no rows parsed (skipped)")
        except Exception as e:  # noqa: BLE001
            log(f"  sectors       csv {name}: {type(e).__name__} (skipped)")
    return {}


def update_sectors() -> dict:
    """Populate securities.sector from NSE sectoral-index constituents (free, no
    paid API), falling back to the niftyindices.com constituent CSVs when the
    JSON API is bot-blocked. Only fills rows whose sector is currently
    empty/Unknown, so any richer EODHD/manual classification is preserved.
    Fail-soft: nothing here ever breaks the nightly run.
    """
    init_db()
    try:
        from curl_cffi import requests as cr
    except Exception as e:  # noqa: BLE001
        log(f"  sectors       curl_cffi unavailable ({type(e).__name__}) — using CSV fallback")
        cr = None

    sym_sector: dict[str, str] = {}
    n_idx = 0
    if cr is None:
        sym_sector = _sectors_from_csv()
        if not sym_sector:
            return {"updated": 0, "indices": 0}
        return _apply_sectors(sym_sector, n_idx)
    # The equity-stockIndices JSON API sits behind Akamai bot management: it only
    # accepts a session carrying the bm_* cookies issued when you load the homepage
    # AND an actual market-data HTML page first. Priming only the homepage (the old
    # behaviour) returned the HTML block page -> JSONDecodeError. So warm both
    # pages, send the market-data Referer + XHR header, and re-warm/retry once on a
    # block. Still fail-soft: a persistent block just contributes nothing.
    INDEX_PAGE = "https://www.nseindia.com/market-data/live-equity-market"
    try:
        s = cr.Session(impersonate="chrome")
        for warm in ("https://www.nseindia.com", INDEX_PAGE):
            try:
                s.get(warm, headers={"Referer": "https://www.nseindia.com/"}, timeout=15)
            except Exception:  # noqa: BLE001
                pass

        def _fetch(index_name: str) -> list:
            r = s.get(
                "https://www.nseindia.com/api/equity-stockIndices",
                params={"index": index_name},
                headers={
                    "Referer": INDEX_PAGE,
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                },
                timeout=20,
            )
            return r.json().get("data", [])

        for index_name, label in _SECTOR_INDICES:
            data = None
            for attempt in range(2):
                try:
                    data = _fetch(index_name)
                    break
                except Exception as e:  # noqa: BLE001
                    if attempt == 0:  # likely a stale/blocked cookie — re-warm once
                        try:
                            s.get(INDEX_PAGE, headers={"Referer": "https://www.nseindia.com/"}, timeout=15)
                        except Exception:  # noqa: BLE001
                            pass
                        continue
                    log(f"  sectors       {index_name}: {type(e).__name__} (skipped)")
            if data is None:
                continue
            n_idx += 1
            for row in data:
                sym = str(row.get("symbol") or "").strip().upper()
                if not sym or " " in sym or sym == index_name:
                    continue  # skip the index summary row / non-tickers
                sym_sector.setdefault(sym, label)  # first (most specific) wins
    except Exception as e:  # noqa: BLE001
        log(f"  sectors       API FAIL {type(e).__name__}: {e}")

    # The JSON API is routinely bot-blocked from cloud IPs — fall back to the
    # plain constituent CSVs so the sector heatmap still gets populated.
    if not sym_sector:
        sym_sector = _sectors_from_csv()
    if not sym_sector:
        log(f"  sectors       no constituents fetched ({n_idx} indices reached)")
        return {"updated": 0, "indices": n_idx}
    return _apply_sectors(sym_sector, n_idx)


def _apply_sectors(sym_sector: dict[str, str], n_idx: int) -> dict:
    """Write a symbol→sector map to the DB (only rows still empty/Unknown)."""
    updated = 0
    with session() as conn:
        for sym, label in sym_sector.items():
            cur = conn.execute(
                "UPDATE securities SET sector=?, updated_at=? "
                "WHERE nse_symbol=? AND (sector IS NULL OR sector='' OR sector='Unknown')",
                (label, _now(), sym),
            )
            updated += cur.rowcount
    log(f"  sectors       updated={updated} mapped={len(sym_sector)} indices={n_idx}")
    return {"updated": updated, "indices": n_idx, "mapped": len(sym_sector)}


# ---------- stage 2: corporate actions ----------
def update_corporate_actions(start: "date | None" = None) -> int:
    started = _now()
    init_db()
    actions = sources.nse_corp_actions(start=start)
    affected: set[str] = set()
    with session() as conn:
        # The CA feed's ISIN can differ from our master's (e.g. post-merger ISIN
        # changes like HDFCBANK: feed reports INE040A01018, spine uses ...01034).
        # Resolve each action to the canonical ISIN by its trading symbol; only
        # fall back to the feed's ISIN when the symbol isn't in the master.
        sym2isin = {
            row["nse_symbol"]: row["isin"]
            for row in conn.execute(
                "SELECT nse_symbol, isin FROM securities WHERE nse_symbol IS NOT NULL"
            ).fetchall()
        }
        for ca in actions:
            isin = sym2isin.get(ca.symbol) or ca.isin
            if not isin:
                continue
            affected.add(isin)
            conn.execute(
                """INSERT INTO corporate_actions(isin,ex_date,kind,ratio,detail,source)
                   VALUES (?,?,?,?,?,?)
                   ON CONFLICT(isin,ex_date,kind) DO UPDATE SET
                     ratio=excluded.ratio, detail=excluded.detail""",
                (isin, ca.ex_date, ca.kind, ca.ratio, ca.detail, ca.source),
            )
        _record(conn, "-", "corp_actions", "ok", rows=len(actions), started=started)
    # Recompute adjusted prices for affected names.
    if affected:
        readjust(sorted(affected))
    return len(actions)


def update_dividends(start: "date | None" = None) -> dict:
    """Ingest cash dividends from the NSE corp-action feed into the SEPARATE
    `dividends` table (kept out of corporate_actions so price adjustment is never
    affected). Resolves to the canonical ISIN by trading symbol, like CAs."""
    init_db()
    divs = sources.nse_dividends(start=start)
    upserted = 0
    with session() as conn:
        sym2isin = {
            row["nse_symbol"]: row["isin"]
            for row in conn.execute(
                "SELECT nse_symbol, isin FROM securities WHERE nse_symbol IS NOT NULL"
            ).fetchall()
        }
        known = {r["isin"] for r in conn.execute("SELECT isin FROM securities").fetchall()}
        for d in divs:
            isin = sym2isin.get(d["symbol"]) or (d["isin"] if d["isin"] in known else "")
            if not isin:
                continue
            conn.execute(
                """INSERT INTO dividends(isin,ex_date,amount,detail,source)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(isin,ex_date) DO UPDATE SET
                     amount=excluded.amount, detail=excluded.detail""",
                (isin, d["ex_date"], d["amount"], d["detail"], "NSE"),
            )
            upserted += 1
    return {"parsed": len(divs), "upserted": upserted}


# ---------- stage 3: EOD prices ----------
def _fetch_bhav(name: str, fn, trade_date: date) -> list[PriceRow]:
    """Fetch one exchange's bhavcopy, returning [] (not raising) on any failure
    so a single bad/empty source never aborts the whole EOD run."""
    try:
        rows = fn(trade_date)
        if not rows:
            log(f"  {name:<5} WARN  no equity rows parsed (holiday or format drift?)")
        return rows
    except Exception as e:
        log(f"  {name:<5} FAIL  {type(e).__name__}: {e}")
        return []


def ingest_eod(trade_date: date) -> dict:
    started = _now()
    init_db()
    iso = trade_date.isoformat()

    nse = _fetch_bhav("NSE", sources.nse_bhavcopy, trade_date)
    bse = _fetch_bhav("BSE", sources.bse_bhavcopy, trade_date)

    if not nse and not bse:
        with session() as conn:
            _record(conn, iso, "eod", "error", message="both NSE and BSE bhavcopy unavailable",
                    started=started)
        return {"date": iso, "golden": 0, "quarantined": 0, "nse": 0, "bse": 0,
                "status": "error"}

    status = "ok" if (nse and bse) else "partial"

    with session() as conn:
        _upsert_bse_master(conn, bse)
        # Backfill ISIN for legacy NSE rows that lack it, via the master map.
        sym2isin = _nse_symbol_to_isin(conn)
        nse_fixed: list[PriceRow] = []
        for r in nse:
            isin = r.isin or sym2isin.get(r.symbol, "")
            nse_fixed.append(PriceRow(**{**r.__dict__, "isin": isin}))
        _upsert_nse_master(conn, nse_fixed)

        golden, quarantine = reconcile(nse_fixed, bse)

        for r in golden:
            if not r.isin:
                continue
            conn.execute(
                """INSERT INTO prices(isin,date,open,high,low,close,volume,adj_factor,adj_close,source)
                   VALUES (?,?,?,?,?,?,?,1.0,?,?)
                   ON CONFLICT(isin,date) DO UPDATE SET
                     open=excluded.open, high=excluded.high, low=excluded.low,
                     close=excluded.close, volume=excluded.volume,
                     adj_close=excluded.close, source=excluded.source""",
                (r.isin, r.date, r.open, r.high, r.low, r.close, r.volume, r.close, r.exchange),
            )
        for q in quarantine:
            import json
            conn.execute(
                "INSERT INTO quarantine(isin,date,reason,payload,created_at) VALUES (?,?,?,?,?)",
                (q["isin"], q["date"], q["reason"], json.dumps(q["payload"]), _now()),
            )
        msg = "" if status == "ok" else "single-source (one exchange unavailable)"
        _record(conn, iso, "eod", status, rows=len(golden),
                quarantined=len(quarantine), message=msg, started=started)

    return {"date": iso, "golden": len(golden), "quarantined": len(quarantine),
            "nse": len(nse), "bse": len(bse), "status": status}


# ---------- stage 4: adjustment ----------
def readjust(isins: list[str] | None = None) -> int:
    """Recompute adj_factor/adj_close over full history for given ISINs (or all)."""
    init_db()
    with session() as conn:
        if isins is None:
            isins = [row["isin"] for row in conn.execute("SELECT DISTINCT isin FROM prices")]
        for isin in isins:
            prows = [
                PriceRow(isin=r["isin"], symbol="", date=r["date"], open=r["open"],
                         high=r["high"], low=r["low"], close=r["close"],
                         volume=r["volume"], exchange=r["source"])
                for r in conn.execute(
                    "SELECT * FROM prices WHERE isin=? ORDER BY date", (isin,)
                )
            ]
            if not prows:
                continue
            cas = [
                CorpAction(isin=c["isin"], ex_date=c["ex_date"], kind=c["kind"],
                           ratio=c["ratio"], detail=c["detail"] or "", source=c["source"])
                for c in conn.execute(
                    "SELECT * FROM corporate_actions WHERE isin=? ORDER BY ex_date DESC", (isin,)
                )
            ]
            for adj in apply_adjustments(prows, cas):
                conn.execute(
                    "UPDATE prices SET adj_factor=?, adj_close=? WHERE isin=? AND date=?",
                    (adj["adj_factor"], adj["adj_close"], adj["isin"], adj["date"]),
                )
    return len(isins)


# ---------- full nightly run ----------
def run_nightly(trade_date: date) -> dict:
    """master -> corp actions -> EOD -> readjust, for one trading date.

    Wrapped in logging so every run leaves a one-line summary (or the failure)
    in data/engine.log, which is what the scheduled task relies on.
    """
    log(f"NIGHTLY start  date={trade_date.isoformat()}")

    # Each stage is independent: a failure is logged and the run continues using
    # whatever is already in the DB (e.g. yesterday's master), because EOD prices
    # are the priority and shouldn't be blocked by a master/CA hiccup.
    master = -1
    try:
        master = update_master()
        log(f"  master        securities={master}")
    except Exception as e:
        log(f"  master        FAIL  {type(e).__name__}: {e} (using existing master)")

    cas = 0
    try:
        cas = update_corporate_actions()
        log(f"  corp_actions  count={cas}")
    except Exception as e:
        log(f"  corp_actions  FAIL  {type(e).__name__}: {e} (skipping CA refresh)")

    try:
        dv = update_dividends()
        log(f"  dividends     parsed={dv['parsed']} upserted={dv['upserted']}")
    except Exception as e:
        log(f"  dividends     FAIL  {type(e).__name__}: {e} (skipping dividends)")

    # ingest_eod already degrades to single-source / empty internally.
    eod = ingest_eod(trade_date)
    log(f"  eod           status={eod['status']} golden={eod['golden']} "
        f"quarantined={eod['quarantined']} nse={eod['nse']} bse={eod['bse']}")

    try:
        readjust()  # full readjust keeps everything consistent
    except Exception as e:
        log(f"  readjust      FAIL  {type(e).__name__}: {e}")

    # Classify segments AFTER ingest so scrips newly added by today's bhavcopy
    # (which the EOD upsert just inserted) get tagged — otherwise they'd stay
    # NULL and leak into the Equity filter.
    try:
        seg = update_segments()
        log(f"  segments      EQ={seg['EQ']} ETF={seg['ETF']} SME={seg['SME']}")
    except Exception as e:
        log(f"  segments      FAIL  {type(e).__name__}: {e} (segments unchanged)")

    # Sector classification from NSE sectoral-index constituents (free; fills the
    # gap left by the paid EODHD enrichment so the screener/portfolio aren't full
    # of "Unknown"). Fail-soft so a blocked NSE call never fails the run.
    try:
        sec = update_sectors()
        log(f"  sectors       updated={sec['updated']} indices={sec['indices']}")
    except Exception as e:
        log(f"  sectors       FAIL  {type(e).__name__}: {e} (sectors unchanged)")

    # Refresh share counts so market cap stays accurate. The BSE bulk feed is a
    # single call covering the whole universe, so we refresh everything every
    # night (no crawl, no per-symbol pacing) — caps then track the latest close.
    try:
        from . import marketcap
        mc = marketcap.enrich_shares(refresh_all=True, progress=False)
        log(f"  marketcap     updated={mc['updated']} unmatched={mc['failed']} "
            f"universe={mc['universe']}")
    except Exception as e:
        log(f"  marketcap     FAIL  {type(e).__name__}: {e} (caps unchanged)")

    result = {"master": master, "corp_actions": cas, **eod}
    if eod["status"] == "error":
        flag = "ERROR"
    elif eod["status"] == "partial" or eod["quarantined"]:
        flag = "WARN"
    else:
        flag = "OK"
    log(f"NIGHTLY {flag}    {result}")
    return result
