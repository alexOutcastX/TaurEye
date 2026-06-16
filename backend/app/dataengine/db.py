"""SQLite storage for the EOD data engine.

One file (data/market.db) holds the whole spine. SQLite is chosen because it is
stdlib (works on Python 3.14 with no native wheels), single-file (trivial to
back up / ship), and plenty fast for an EOD universe (~7-8k scrips x daily rows).

Schema:
  securities         canonical master keyed by ISIN, mapped to NSE/BSE symbols
  prices             one row per (isin, date): raw OHLCV + adjusted close/factor
  corporate_actions  splits/bonuses/dividends driving the adjustment factor
  quarantine         rows that failed reconciliation, kept OUT of the spine
  ingest_runs        audit log: what ran, for which date, with what result
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import DB_PATH, ensure_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS securities (
    isin        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    nse_symbol  TEXT,
    bse_code    TEXT,
    bse_symbol  TEXT,
    series      TEXT,
    sector      TEXT,
    face_value  REAL,
    listed_on   TEXT,
    shares_outstanding REAL,        -- issued share count (NSE issuedSize); NULL until enriched
    shares_src  TEXT,               -- where it came from (e.g. "NSE")
    shares_at   TEXT,               -- ISO timestamp the count was last refreshed
    segment     TEXT,               -- instrument class: EQ | ETF | SME (NULL=unclassified)
    active      INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sec_nse ON securities(nse_symbol);
CREATE INDEX IF NOT EXISTS ix_sec_bse ON securities(bse_code);

CREATE TABLE IF NOT EXISTS prices (
    isin        TEXT NOT NULL,
    date        TEXT NOT NULL,          -- ISO YYYY-MM-DD
    open        REAL NOT NULL,
    high        REAL NOT NULL,
    low         REAL NOT NULL,
    close       REAL NOT NULL,
    volume      INTEGER NOT NULL,
    adj_factor  REAL NOT NULL DEFAULT 1.0,
    adj_close   REAL NOT NULL,
    source      TEXT NOT NULL,          -- which exchange won as golden
    PRIMARY KEY (isin, date)
);
CREATE INDEX IF NOT EXISTS ix_prices_date ON prices(date);

CREATE TABLE IF NOT EXISTS corporate_actions (
    isin        TEXT NOT NULL,
    ex_date     TEXT NOT NULL,
    kind        TEXT NOT NULL,          -- split | bonus | dividend
    ratio       REAL NOT NULL,          -- multiplicative price factor (<1 splits)
    detail      TEXT,
    source      TEXT NOT NULL,
    PRIMARY KEY (isin, ex_date, kind)
);

-- Cash dividends, kept SEPARATE from corporate_actions so they never feed the
-- price-adjustment factor (adjust.py reads corporate_actions only). amount is
-- ₹ per share on the ex_date.
CREATE TABLE IF NOT EXISTS dividends (
    isin        TEXT NOT NULL,
    ex_date     TEXT NOT NULL,
    amount      REAL NOT NULL,
    detail      TEXT,
    source      TEXT,
    PRIMARY KEY (isin, ex_date)
);

CREATE TABLE IF NOT EXISTS quarantine (
    isin        TEXT,
    date        TEXT,
    reason      TEXT NOT NULL,
    payload     TEXT,                   -- JSON of the conflicting values
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date  TEXT NOT NULL,
    stage       TEXT NOT NULL,
    status      TEXT NOT NULL,          -- ok | partial | error
    rows        INTEGER DEFAULT 0,
    quarantined INTEGER DEFAULT 0,
    message     TEXT,
    started_at  TEXT NOT NULL,
    ended_at    TEXT
);

-- ===== Fundamentals (Phase 1: financial results + shareholding + filings) =====
-- These are ingested separately from the EOD price spine (slower cadence; the
-- exchanges publish them quarterly). `raw` keeps the source JSON so nothing is
-- lost even when a structured column isn't mapped yet.
CREATE TABLE IF NOT EXISTS financials (
    isin         TEXT NOT NULL,
    period_end   TEXT NOT NULL,         -- ISO YYYY-MM-DD (quarter/year end)
    period_type  TEXT NOT NULL,         -- Q | H | Y
    consolidated INTEGER NOT NULL DEFAULT 0,
    revenue      REAL,
    other_income REAL,
    expenses     REAL,
    ebitda       REAL,
    interest     REAL,
    depreciation REAL,
    pbt          REAL,
    tax          REAL,
    net_profit   REAL,
    eps          REAL,
    raw          TEXT,                  -- source row JSON (defensive)
    source       TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (isin, period_end, period_type, consolidated)
);
CREATE INDEX IF NOT EXISTS ix_fin_isin ON financials(isin, period_end DESC);

CREATE TABLE IF NOT EXISTS shareholding (
    isin                TEXT NOT NULL,
    period_end          TEXT NOT NULL,  -- ISO quarter end
    promoter_pct        REAL,
    promoter_pledge_pct REAL,           -- % of promoter holding pledged
    public_pct          REAL,
    fii_pct             REAL,
    dii_pct             REAL,
    raw                 TEXT,
    source              TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    PRIMARY KEY (isin, period_end)
);
CREATE INDEX IF NOT EXISTS ix_shp_isin ON shareholding(isin, period_end DESC);

CREATE TABLE IF NOT EXISTS announcements (
    isin      TEXT NOT NULL,
    dt        TEXT NOT NULL,            -- ISO datetime of the filing
    category  TEXT,                     -- Order | Board Meeting | Results | ...
    headline  TEXT NOT NULL,
    url       TEXT,
    source    TEXT NOT NULL,
    PRIMARY KEY (isin, dt, headline)
);
CREATE INDEX IF NOT EXISTS ix_ann_isin ON announcements(isin, dt DESC);

-- Resume/rate-limit bookkeeping for the per-symbol fundamentals fetch.
CREATE TABLE IF NOT EXISTS funda_runs (
    isin       TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    status     TEXT
);

-- Balance-sheet snapshots (debt analysis: borrowings, equity, D/E, cash).
CREATE TABLE IF NOT EXISTS balance_sheets (
    isin          TEXT NOT NULL,
    period_end    TEXT NOT NULL,        -- ISO YYYY-MM-DD
    period_type   TEXT NOT NULL,        -- Q | Y
    total_assets  REAL,
    total_liab    REAL,
    total_debt    REAL,                 -- short + long term borrowings
    long_term_debt REAL,
    short_term_debt REAL,
    cash          REAL,
    net_debt      REAL,
    equity        REAL,                 -- total shareholders' equity
    net_working_capital REAL,
    raw           TEXT,
    source        TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (isin, period_end, period_type)
);
CREATE INDEX IF NOT EXISTS ix_bs_isin ON balance_sheets(isin, period_end DESC);
"""


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


# Columns added to `securities` after the original schema shipped. Each is
# applied with ALTER TABLE on an existing DB (CREATE TABLE IF NOT EXISTS never
# alters an existing table). Idempotent: skipped if the column already exists.
_SECURITIES_MIGRATIONS = {
    "shares_outstanding": "REAL",
    "shares_src": "TEXT",
    "shares_at": "TEXT",
    "segment": "TEXT",
    "about": "TEXT",                    # company profile (vendor General.Description)
}


def _migrate(conn: sqlite3.Connection) -> None:
    have = {r["name"] for r in conn.execute("PRAGMA table_info(securities)")}
    for col, decl in _SECURITIES_MIGRATIONS.items():
        if col not in have:
            conn.execute(f"ALTER TABLE securities ADD COLUMN {col} {decl}")


def init_db(path: Path = DB_PATH) -> None:
    with connect(path) as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
        conn.commit()


@contextmanager
def session(path: Path = DB_PATH):
    """Transactional connection: commits on success, rolls back on error."""
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
