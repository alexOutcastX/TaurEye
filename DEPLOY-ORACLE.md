# Hosting TaurEye on Oracle Cloud (Always-Free, Mumbai)

Goal: backend runs 24/7 in the cloud so the app works with your PC off, and a
nightly job keeps the EOD data fresh on its own. Region must be **Mumbai** so the
NSE/BSE sources (esp. BSE market cap & SENSEX) are reachable.

You do steps 1–2 (account/VM — I can't). Everything else is copy-paste.

---

## 1. Create the VM (one-time)
1. Sign up at cloud.oracle.com → **Home region = India South (Mumbai)**.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 22.04**
   - Shape: **Ampere (Arm) — VM.Standard.A1.Flex**, e.g. 2 OCPU / 12 GB (Always-Free covers up to 4/24).
   - Add your SSH public key (download/keep the private key).
3. After it boots, note the **Public IP**.

## 2. Open the port (BOTH layers — Oracle blocks ports twice)
- **Cloud firewall:** VCN → Security List → add **Ingress**: Source `0.0.0.0/0`, TCP, dest port **8010**.
- **Instance firewall (Ubuntu images block it too):** SSH in, then:
  ```bash
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8010 -j ACCEPT
  sudo netfilter-persistent save
  ```

## 3. Install Docker (on the VM)
```bash
ssh ubuntu@YOUR_VM_IP
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Copy the app + database up (from your PC)
From `C:\CLAUDECODE\TaurEye` (PowerShell), upload the backend, compose files, and
the slimmed DB (renamed to `market.db` in a `data/` folder):
```powershell
scp -r backend Dockerfile docker-compose.yml .dockerignore ubuntu@YOUR_VM_IP:~/taureye/
ssh ubuntu@YOUR_VM_IP "mkdir -p ~/taureye/data"
scp backend\data\market.slim.db ubuntu@YOUR_VM_IP:~/taureye/data/market.db
```
(Don't upload `backend/data` itself — only the single `market.slim.db` → `data/market.db`.)

## 5. Set the API key and start it (on the VM)
```bash
cd ~/taureye
# pick any long secret; remember it for the app build
echo "TAUREYE_API_KEY=$(openssl rand -hex 24)" > .env
cat .env            # copy this key — you'll bake it into the APK
docker compose up -d --build
```
Test (note the key is required on every /api call except health):
```bash
curl http://localhost:8010/api/health
curl -H "X-API-Key: PASTE_KEY" "http://localhost:8010/api/indices"
```
From your phone/browser: `http://YOUR_VM_IP:8010/api/health` should return ok.

## 6. Nightly auto-refresh (so data stays current, PC off)
```bash
crontab -e
```
Add (19:30 IST = 14:00 UTC, after bhavcopies publish; weekdays):
```
0 14 * * 1-5 cd /home/ubuntu/taureye && docker compose exec -T api python -m backend.app.dataengine.run nightly >> data/cron.log 2>&1 && docker compose restart api
```
The `restart` is required: the backend caches its metrics snapshot at startup, so
it must restart to pick up the night's new prices.

## 7. Point the app at the cloud (rebuild — I'll do this for you)
The APK currently targets your LAN IP. To use the cloud backend, rebuild with:
```
set VITE_API_BASE=http://YOUR_VM_IP:8010
set VITE_API_KEY=YOUR_KEY
npm run build && npx cap sync android
cd android && gradlew.bat assembleDebug
```
Then reinstall the APK. Now it works from anywhere, PC off.

---

## Optional: HTTPS (recommended if you keep it public long-term)
Plain HTTP works (the app allows cleartext), but for real TLS:
1. Get a free subdomain at **duckdns.org** pointing to YOUR_VM_IP.
2. Run **Caddy** as a reverse proxy (auto Let's Encrypt cert) in front of :8010.
   Ask me and I'll add a `caddy` service to the compose file + the Caddyfile.
Then use `VITE_API_BASE=https://yourname.duckdns.org`.

## Notes
- **Security:** the API key stops casual abuse. It's embedded in the app bundle
  (so not bulletproof), but the data is public market data — acceptable for
  personal use. Rotate the key by editing `.env` and `docker compose up -d`.
- **ARM build:** the image is multi-arch; `curl_cffi` ships ARM64 wheels, so the
  build works on the Ampere VM. If pip ever fails to find a wheel, add
  `build-essential libffi-dev` to the Dockerfile's apt install.
- **Updating the DB manually:** scp a new `market.db` into `~/taureye/data/` and
  `docker compose restart api`.
