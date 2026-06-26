#!/usr/bin/env bash
# One-shot health snapshot of the TaurEye + Supabase stacks. Read-only.
set -uo pipefail
cd "$(dirname "$0")"

echo "== app containers =="
sudo docker compose ps
echo; echo "== supabase containers =="
( cd supabase-docker 2>/dev/null && sudo docker compose ps ) || echo "(supabase-docker not found)"

echo; echo "== data freshness (manifest) =="
curl -s https://taureye.com/data/manifest.json | head -c 300; echo

echo; echo "== history depth (RELIANCE) =="
curl -s https://taureye.com/data/candles/RELIANCE.json \
  | python3 -c "import sys,json;d=json.load(sys.stdin);c=d['candles'];print('candles:',len(c),'| first',c[0][0],'| last',c[-1][0],'| close',c[-1][4])" \
  2>/dev/null || echo "(could not read)"

echo; echo "== endpoints =="
curl -s -o /dev/null -w "site   https://taureye.com        -> %{http_code}\n" https://taureye.com
curl -s -o /dev/null -w "auth   api.taureye.com/auth/health -> %{http_code}\n" https://api.taureye.com/auth/v1/health

echo; echo "== TLS certs =="
command -v certbot >/dev/null && sudo certbot certificates 2>/dev/null | grep -iE "Certificate Name|Domains|Expiry" | sed 's/^/  /'
