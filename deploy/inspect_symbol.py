import os
from backend.app.dataengine.db import session, init_db

sym = os.environ.get("SYM", "RELIANCE").upper()
init_db()
with session() as c:
    gl = c.execute("SELECT MAX(date) m FROM prices").fetchone()["m"]
    print("symbol     :", sym)
    print("spine last :", gl, "(latest date in prices, any symbol)")
    rows = c.execute(
        "SELECT isin,name,nse_symbol,bse_symbol,bse_code,segment,active "
        "FROM securities WHERE UPPER(nse_symbol)=? OR UPPER(bse_symbol)=? "
        "ORDER BY active DESC",
        (sym, sym),
    ).fetchall()
    print("securities :", len(rows), "master row(s) map to this symbol")
    for s in rows:
        isin = s["isin"]
        agg = c.execute(
            "SELECT COUNT(*) n, MIN(date) lo, MAX(date) hi FROM prices WHERE isin=?",
            (isin,),
        ).fetchone()
        last = c.execute(
            "SELECT date,close,adj_close,source FROM prices WHERE isin=? "
            "ORDER BY date DESC LIMIT 3",
            (isin,),
        ).fetchall()
        flag = "" if agg["hi"] == gl else "  <-- STALE vs spine"
        print("")
        print("  isin=%s active=%s seg=%s nse=%s bse=%s code=%s" % (
            isin, s["active"], s["segment"], s["nse_symbol"], s["bse_symbol"], s["bse_code"]))
        print("  name=%s" % s["name"])
        print("  prices: %s rows  %s..%s%s" % (agg["n"], agg["lo"], agg["hi"], flag))
        for r in last:
            print("    %s close=%s adj=%s src=%s" % (
                r["date"], r["close"], r["adj_close"], r["source"]))
    if len(rows) != 1:
        print("")
        print("NOTE: a healthy symbol maps to exactly 1 active master row; %d here." % len(rows))
