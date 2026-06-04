#!/usr/bin/env bash
# TaurEye nightly data refresh (STATIC hosting model) — runs ON THE VM via cron.
# Pulls EOD into the SQLite spine, then renders the JSON bundle (fundamentals,
# indices, manifest + per-symbol candles) straight into the nginx web root so the
# static site auto-updates. Install to /opt/taureye/refresh.sh (chmod +x) and add
# the cron line printed by setup-vm.sh.
export TAUREYE_DATA_DIR=/opt/taureye/data
export TAUREYE_DB_PATH=/opt/taureye/data/market.db
export TAUREYE_PROVIDER=db
cd /opt/taureye || exit 1
LOG=/opt/taureye/data/refresh.log
echo "===== $(date) refresh START =====" >> "$LOG"
./venv/bin/python -m backend.app.dataengine.run nightly >> "$LOG" 2>&1 || echo "[refresh] nightly FAILED (republishing anyway)" >> "$LOG"
./venv/bin/python -m backend.app.dataengine.run export --all --out /usr/share/nginx/html/data >> "$LOG" 2>&1 || echo "[refresh] export FAILED" >> "$LOG"
sudo restorecon -R /usr/share/nginx/html/data >/dev/null 2>&1 || true
echo "===== $(date) refresh DONE =====" >> "$LOG"
