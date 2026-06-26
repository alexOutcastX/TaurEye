#!/usr/bin/env bash
# Re-render the JSON bundle from the current spine (after a backfill, nightly,
# or a backend code change). Run from deploy/azure on the VM.
set -euo pipefail
cd "$(dirname "$0")"

# If a backend change needs to take effect (e.g. the BSE LTP patch), rebuild the
# engine image first:  REBUILD=1 bash reexport.sh
if [ "${REBUILD:-0}" = "1" ]; then
  echo "==> Rebuilding dataengine image..."
  sudo docker compose build dataengine
  sudo docker compose up -d dataengine
fi

echo "==> Exporting bundle..."
sudo docker compose exec -T dataengine bash -lc \
  "python -m backend.app.dataengine.run export --all --gz --out /data/bundle"

echo "==> Done. Verify:"
curl -s https://taureye.com/data/manifest.json | head -c 200; echo
echo "(hard-refresh the site to drop the 1-hour /data cache)"
