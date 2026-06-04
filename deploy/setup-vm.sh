#!/usr/bin/env bash
# One-time VM setup for TaurEye CI deploys.
# Run ON the VM as the deploy user (e.g. opc/ubuntu):
#   bash setup-vm.sh
# It installs Caddy + Python, creates the venv, registers the API service and
# the web server, opens the firewall, and sets up the nightly data refresh.
# After this, GitHub Actions handles every deploy automatically.
set -euo pipefail

USER_NAME="$(whoami)"
APP=~/taureye
mkdir -p "$APP/dist" "$APP/backend/data"

echo "==> Installing packages (caddy, python, rsync, git)..."
if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y python3 python3-pip rsync git curl 'dnf-command(copr)'
  sudo dnf copr enable -y @caddy/caddy || true
  sudo dnf install -y caddy
  FW=firewalld
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3 python3-venv python3-pip rsync git curl debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update && sudo apt-get install -y caddy
  FW=ufw
else
  echo "Unsupported OS (need dnf or apt)"; exit 1
fi

echo "==> Python venv + backend deps..."
python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install --upgrade pip
[ -f "$APP/backend/requirements.txt" ] && "$APP/.venv/bin/pip" install -r "$APP/backend/requirements.txt" || \
  echo "(backend not deployed yet — first GitHub deploy will install deps)"

echo "==> Server env file (edit secrets here)..."
if [ ! -f "$APP/.env.server" ]; then
  cat > "$APP/.env.server" <<EOF
TAUREYE_PROVIDER=db
TAUREYE_API_KEY=
TAUREYE_AI_KEY=
TAUREYE_AI_BASE=https://api.openai.com/v1
TAUREYE_AI_MODEL=gpt-4o-mini
EOF
  echo "   wrote $APP/.env.server (fill in TAUREYE_API_KEY / TAUREYE_AI_KEY)"
fi

echo "==> systemd service for the API..."
sed "s/USER/$USER_NAME/g" "$APP/deploy/taureye-api.service" 2>/dev/null > /tmp/taureye-api.service || \
cat > /tmp/taureye-api.service <<EOF
[Unit]
Description=TaurEye API (uvicorn)
After=network.target
[Service]
User=$USER_NAME
WorkingDirectory=$APP
EnvironmentFile=$APP/.env.server
ExecStart=$APP/.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8010
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
sudo cp /tmp/taureye-api.service /etc/systemd/system/taureye-api.service
sudo systemctl daemon-reload
sudo systemctl enable taureye-api || true

echo "==> Caddy (web + /api proxy)..."
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
:80 {
	encode gzip
	root * $APP/dist
	handle /api/* {
		reverse_proxy 127.0.0.1:8010
	}
	handle {
		try_files {path} /index.html
		file_server
	}
}
EOF
sudo systemctl enable --now caddy
sudo systemctl restart caddy

echo "==> Firewall: open 80/443..."
if [ "$FW" = firewalld ]; then
  sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
else
  sudo ufw allow 80 && sudo ufw allow 443 || true
fi
# Also allow at the OS level for Oracle images that use iptables:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save || true

echo "==> Nightly data refresh cron (19:30 IST = 14:00 UTC, weekdays)..."
( crontab -l 2>/dev/null | grep -v 'taureye nightly' ;
  echo "0 14 * * 1-5 cd $APP && .venv/bin/python -m backend.app.dataengine.run nightly >> $APP/backend/data/cron.log 2>&1 && sudo systemctl restart taureye-api"
) | crontab -

echo ""
echo "DONE. Remaining:"
echo " 1) Open ports 80/443 in the Oracle VCN Security List (cloud firewall)."
echo " 2) Put your market.db at $APP/backend/data/market.db (scp it up once)."
echo " 3) Edit secrets in $APP/.env.server, then: sudo systemctl start taureye-api"
echo " 4) Add the GitHub secrets and push to main — deploys are automatic after that."
