"""TaurEye EOD data engine.

Pulls end-of-day data from the OFFICIAL exchange sources (NSE & BSE), stores it
in a local SQLite database, reconciles overlapping fields across sources,
adjusts prices for corporate actions, and quarantines anything that doesn't
agree. The screener reads the result through providers/db.py.

Design goals (your ask: "0 error, 100 accuracy"):
  * Golden sources only        -> exchange bhavcopies + filings, never a single
                                  scraped third-party page.
  * Two-source reconciliation  -> NSE vs BSE on shared ISINs; mismatches beyond
                                  tolerance go to quarantine instead of the spine.
  * Point-in-time integrity     -> every ingest run is recorded; re-runnable and
                                  idempotent per trading date.
  * Corporate-action adjusted   -> splits/bonuses fold into an adjustment factor
                                  so historical closes stay continuous.
"""
