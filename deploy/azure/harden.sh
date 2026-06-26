#!/usr/bin/env bash
# TaurEye — apply security hardening on the VM. Re-runnable.
#   bash deploy/azure/harden.sh
#
# WARNING: step 1 disables SSH password auth. Make sure key-based SSH already
# works for you (it does if you're reading this over SSH) BEFORE running.
set -uo pipefail
cd "$(dirname "$0")"

echo "== 1. SSH: disable password auth + root login =="
SC=/etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SC"
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "$SC"
sudo systemctl reload sshd 2>/dev/null || sudo systemctl reload ssh 2>/dev/null || true
echo "   done"

echo "== 2. fail2ban (SSH brute-force protection) =="
if ! command -v fail2ban-client >/dev/null; then
  (command -v dnf >/dev/null && sudo dnf install -y fail2ban) \
    || (sudo apt-get update && sudo apt-get install -y fail2ban) || echo "   (install skipped)"
fi
sudo systemctl enable --now fail2ban 2>/dev/null || true
echo "   done"

echo "== 3. Bind Supabase Kong to localhost (reachable only via host nginx) =="
if [ -d supabase-docker ]; then
  cat > supabase-docker/docker-compose.override.yml <<'YAML'
# Managed by harden.sh — Kong only on localhost; the public edge is host nginx.
services:
  kong:
    ports: !override
      - "127.0.0.1:8000:8000"
YAML
  ( cd supabase-docker && sudo docker compose up -d kong ) \
    && echo "   Kong -> 127.0.0.1:8000  (now CLOSE port 8000 in the Azure NSG)" \
    || echo "   (needs Docker Compose v2.20+ for !override; otherwise bind manually)"
else
  echo "   (supabase-docker not found, skipped)"
fi

echo "== 4. nginx security headers (host edge) =="
sudo mkdir -p /etc/nginx/snippets
sudo cp nginx-security-headers.conf /etc/nginx/snippets/taureye-security.conf \
  && echo "   copied -> /etc/nginx/snippets/taureye-security.conf"

cat <<'NOTE'

MANUAL STEPS REMAINING:
  - Azure NSG: leave ONLY inbound 22/80/443 open (close 8000).
  - Add to each HTTPS server block in /etc/nginx/sites-available/taureye:
        include /etc/nginx/snippets/taureye-security.conf;
    then:  sudo nginx -t && sudo systemctl reload nginx
  - Run ./secaudit.sh again to confirm the FAIL/WARN items are cleared.
NOTE
