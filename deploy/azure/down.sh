#!/usr/bin/env bash
# Stop the TaurEye app stack and Supabase (data volumes are preserved).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Stopping TaurEye app stack…"
docker compose down

if [ -d supabase-docker ]; then
  echo "==> Stopping Supabase…"
  ( cd supabase-docker && docker compose down )
fi
echo "Down. (Volumes kept — use 'docker compose down -v' to wipe data.)"
