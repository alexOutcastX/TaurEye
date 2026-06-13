import os
import sqlite3
from datetime import datetime, timezone

from backend.app.dataengine.config import DB_PATH

# The cron (refresh.sh) pins TAUREYE_DB_PATH=/opt/taureye/data/market.db, but the
# dataops actions don't set it, so they fall back to the engine default. If those
# resolve to DIFFERENT files the nightly and the manual publish operate on
# different spines (one can silently clobber the other). This prints every
# candidate path, its realpath (to reveal a symlink), and its freshest price
# date so we can confirm they're the same DB.
cands = []
env = os.environ.get("TAUREYE_DB_PATH")
if env:
    cands.append(("env TAUREYE_DB_PATH", env))
cands.append(("engine default", str(DB_PATH)))
cands.append(("cron (refresh.sh)", "/opt/taureye/data/market.db"))
cands.append(("backend/data", "/opt/taureye/backend/data/market.db"))

seen = {}
for label, p in cands:
    rp = os.path.realpath(p)
    note = ""
    if rp in seen:
        note = "  (SAME FILE as: %s)" % seen[rp]
    else:
        seen[rp] = label
    shown = p + ((" -> " + rp) if rp != p else "")
    if not os.path.exists(p):
        print("%-22s %s  MISSING" % (label, shown))
        continue
    st = os.stat(p)
    try:
        c = sqlite3.connect("file:%s?mode=ro" % p, uri=True)
        last = c.execute("SELECT MAX(date) FROM prices").fetchone()[0]
        n = c.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
        c.close()
    except Exception as e:  # noqa: BLE001
        last, n = "ERR:%s" % e, "?"
    print("%-22s %s%s" % (label, shown, note))
    print("    size=%.1fMB  mtime=%s  last_price=%s  rows=%s" % (
        st.st_size / 1e6,
        datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(timespec="seconds"),
        last, n))
