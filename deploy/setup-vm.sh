#!/usr/bin/env bash
# One-time VM setup for TaurEye — STATIC hosting model.
# Run ON the VM as the deploy user (opc):  bash setup-vm.sh
#
# Architecture: nginx serves the built SPA + a precomputed JSON bundle under
# /data. The screener and charts run client-side off that bundle, so there is NO
# live application backend (no uvicorn/Caddy). A nightly cron (refresh.sh)
# regenerates the bundle into the nginx web root, and GitHub Actions publishes
# new SPA builds. The app lives in /opt/taureye (system path) — NOT /home —
# because Oracle Linux runs SELinux enforcing and denies cron/services that read
# or execute out of user home dirs (user_home_t).
set -euo pipefail

USER_NAME="$(whoami)"
APP=/opt/taureye
WEBROOT=/usr/share/nginx/html
HERE="$(cd "$(dirname "$0")" && pwd)"

sudo mkdir -p "$APP/data" "$APP/backend"
sudo chown -R "$USER_NAME:$USER_NAME" "$APP"

echo "==> Installing packages (nginx, python, rsync, git)..."
if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y nginx python3 python3-pip rsync git curl
  FW=firewalld
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y nginx python3 python3-venv python3-pip rsync git curl
  FW=ufw
else
  echo "Unsupported OS (need dnf or apt)"; exit 1
fi

echo "==> Python venv + exporter deps..."
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install --upgrade pip
[ -f "$APP/backend/requirements.txt" ] && "$APP/venv/bin/pip" install -r "$APP/backend/requirements.txt" || \
  echo "(backend not deployed yet — first GitHub deploy ships the exporter code)"

echo "==> nginx site config (SPA + /data bundle)..."
sudo cp "$HERE/nginx-taureye.conf" /etc/nginx/conf.d/taureye.conf
# Oracle's stock nginx.conf ships a default server on :80 — neutralise it so our
# default_server wins (ignore if the file/has no such block).
sudo sed -i 's/^\(\s*listen\s*80\s*default_server;\)/#\1/' /etc/nginx/nginx.conf 2>/dev/null || true

echo "==> Web root ($WEBROOT) owned by $USER_NAME so CI + refresh.sh can publish..."
sudo mkdir -p "$WEBROOT/data"
sudo chown -R "$USER_NAME:$USER_NAME" "$WEBROOT"

echo "==> Nightly refresh script..."
cp "$HERE/refresh.sh" "$APP/refresh.sh"
chmod +x "$APP/refresh.sh"

echo "==> SELinux contexts so nginx can serve the web root..."
sudo restorecon -R "$WEBROOT" 2>/dev/null || true
# Let nginx read files in the web root if SELinux mislabels uploaded files.
sudo chcon -R -t httpd_sys_content_t "$WEBROOT" 2>/dev/null || true

echo "==> Enable + start nginx..."
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

echo "==> Firewall: open 80/443..."
if [ "$FW" = firewalld ]; then
  sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
else
  sudo ufw allow 80 && sudo ufw allow 443 || true
fi
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save || true

echo "==> Nightly data refresh + republish cron (21:00 IST)..."
# CRON_TZ pins the schedule to India time no matter what the VM's clock is set
# to (cronie/Vixie honour it). Markets close 15:30 IST, so 21:00 IST is safely
# after EOD data is published. grep -vx clears any prior CRON_TZ line so re-runs
# stay idempotent.
( crontab -l 2>/dev/null | grep -v 'taureye nightly' | grep -vx 'CRON_TZ=Asia/Kolkata' ;
  echo "CRON_TZ=Asia/Kolkata" ;
  echo "0 21 * * * $APP/refresh.sh  # taureye nightly"
) | crontab -

echo ""
echo "DONE. Remaining:"
echo " 1) Open ports 80/443 in the Oracle VCN Security List (cloud firewall)."
echo " 2) Put your market.db at $APP/data/market.db (scp it up once)."
echo " 3) Seed the first bundle now:  $APP/refresh.sh"
echo " 4) Add the GitHub secrets (VM_HOST/VM_USER/VM_SSH_KEY) and push to main —"
echo "    every push then rebuilds the SPA and publishes it to nginx automatically."
