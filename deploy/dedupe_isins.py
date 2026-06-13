import os
from backend.app.dataengine.db import session, init_db

# One-off maintenance: a scrip that changed ISIN (e.g. a face-value split mints a
# new ISIN) can leave TWO active master rows with the same nse_symbol. The
# exporter writes per-symbol candle/metrics files keyed by symbol, so the stale
# duplicate can overwrite the live one and freeze that stock's price/chart. This
# keeps, per symbol, the ISIN with the freshest price date (the one still
# trading) and deactivates the rest. READ + a targeted active-flag UPDATE only;
# no price rows are touched, and it is fully reversible (set active=1 back).
DRY = os.environ.get("DRY", "0") == "1"
init_db()
with session() as c:
    dups = c.execute(
        "SELECT nse_symbol FROM securities WHERE active=1 AND nse_symbol IS NOT NULL "
        "GROUP BY nse_symbol HAVING COUNT(*) > 1"
    ).fetchall()
    print("symbols with >1 active ISIN row:", len(dups))
    fixed = 0
    for d in dups:
        sym = d["nse_symbol"]
        rows = c.execute(
            "SELECT isin, (SELECT MAX(date) FROM prices WHERE isin=s.isin) hi, "
            "(SELECT COUNT(*) FROM prices WHERE isin=s.isin) n "
            "FROM securities s WHERE active=1 AND nse_symbol=?",
            (sym,),
        ).fetchall()
        ranked = sorted(rows, key=lambda r: ((r["hi"] or ""), r["n"] or 0), reverse=True)
        keep, drop = ranked[0], ranked[1:]
        print("  %-14s keep %s (last=%s n=%s) | retire %s" % (
            sym, keep["isin"], keep["hi"], keep["n"],
            ", ".join("%s(last=%s)" % (r["isin"], r["hi"]) for r in drop)))
        if not DRY:
            for r in drop:
                c.execute(
                    "UPDATE securities SET active=0, updated_at=datetime('now') WHERE isin=?",
                    (r["isin"],),
                )
                fixed += 1
    print(("DRY-RUN: would retire" if DRY else "retired"), fixed, "stale ISIN row(s)")
