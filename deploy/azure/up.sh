#!/usr/bin/env bash
# Bring up the whole TaurEye box on the Azure VM: Supabase + the app stack.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] && { set -a; . ./.env; set +a; }

if [ ! -d supabase-docker ]; then
  echo "!! ./supabase-docker not found — clone it first (DEPLOY-AZURE.md step 4):"
  echo "   git clone --depth 1 https://github.com/supabase/supabase tmp-supabase && \\"
  echo "   mv tmp-supabase/docker supabase-docker && rm -rf tmp-supabase"
  exit 1
fi

echo "==> 1/2 Supabase…"
( cd supabase-docker && docker compose up -d )

echo "==> 2/2 TaurEye app (web + dataengine + scheduler)…"
docker compose up -d --build

echo ""
echo "Up. Web:     http://${AZURE_PUBLIC_IP:-<vm-ip>}/"
echo "    Supabase: http://${AZURE_PUBLIC_IP:-<vm-ip>}:8000  (Studio + API gateway)"
echo "If /data is empty, seed the first bundle (DEPLOY-AZURE.md step 8)."
