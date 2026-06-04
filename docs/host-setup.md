# Free VM setup — host the TaurEye chart data

Goal: a free, always-on Linux VM running nginx that serves the static data bundle
(per-symbol candle files for charts) over the internet, so the mobile app can
stream charts. The screener stays bundled/offline; only charts hit this host.

Recommended provider: **Oracle Cloud "Always Free"** — it gives a genuinely
free, persistent VM with a public IP and 200 GB storage (plenty for the ~210 MB
bundle). You already have an Oracle VM, so this matches.

> Throughout, replace `<VM_IP>` with your instance's public IP and
> `<your-domain>` with your domain (only needed for HTTPS).

---

## 1. Create the free VM (Oracle Cloud)

1. Sign up / sign in at https://cloud.oracle.com (the free tier needs a card for
   identity but is not charged).
2. **Menu → Compute → Instances → Create instance.**
3. Image & shape:
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** `VM.Standard.E2.1.Micro` (AMD, Always Free) — reliably available.
     The Ampere ARM `A1.Flex` is also free and more powerful if you can get it.
4. **Add SSH keys:** choose "Generate a key pair for me" and **download both
   keys**, or paste your own public key. You need the private key to log in.
5. Leave networking default (it creates a VCN with a public subnet). Ensure
   **"Assign a public IPv4 address"** is on.
6. **Create.** Note the **public IP** once it's running.

## 2. Open the firewall — TWO layers (Oracle gotcha)

Oracle blocks ports at both the cloud network *and* the OS. Do both.

**A) Cloud Security List (ingress rules):**
- Instance → its **VCN** → **Security Lists** → default list → **Add Ingress Rules**:
  - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80** (HTTP).
  - Add another for port **443** (HTTPS).

**B) OS firewall (after you SSH in, step 3):**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save     # persist across reboots
```

## 3. Connect via SSH

From your machine (PowerShell on Windows works):
```bash
ssh -i path\to\your-private-key ubuntu@<VM_IP>
```
(Oracle Ubuntu's default user is `ubuntu`.)

## 4. Install nginx

```bash
sudo apt update && sudo apt install -y nginx
sudo systemctl enable --now nginx
```
Visit `http://<VM_IP>/` in a browser — you should see the nginx welcome page.

## 5. Create the data directory

```bash
sudo mkdir -p /var/www/taureye/data
sudo chown -R $USER:$USER /var/www/taureye
```

## 6. Configure nginx (CORS + caching + gzip)

```bash
sudo tee /etc/nginx/sites-available/taureye >/dev/null <<'EOF'
server {
    listen 80;
    server_name _;            # replace with <your-domain> if you have one

    root /var/www/taureye;
    location /data/ {
        # the app fetches cross-origin, so CORS must be allowed
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        if ($request_method = OPTIONS) { return 204; }

        # JSON files are static and change once a day — cache them
        add_header Cache-Control "public, max-age=3600";
        types { application/json json; }
        gzip on;
        gzip_types application/json;
        try_files $uri =404;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/taureye /etc/nginx/sites-enabled/taureye
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 7. Upload the data bundle from your PC

The bundle was generated at `C:\TAUREYE\taureye-host-data\` (fundamentals.json,
metrics.json, indices.json, manifest.json, and `candles\<SYMBOL>.json` ×5,833).
Upload its **contents** into `/var/www/taureye/data/` on the VM.

**Option A — scp (built into Windows 10/11 PowerShell):**
```powershell
scp -i path\to\your-private-key -r C:\TAUREYE\taureye-host-data\* ubuntu@<VM_IP>:/var/www/taureye/data/
```

**Option B — WinSCP (GUI):** connect with the same key, drag the contents of
`taureye-host-data` into `/var/www/taureye/data/`.

> ~210 MB over ~5,800 small files — scp is fine but a bit slow per-file. If it
> drags, zip first (`tar`/7-Zip), upload the one archive, and extract on the VM:
> `tar xf bundle.tar -C /var/www/taureye/data/`.

## 8. Test it

```bash
curl -s http://<VM_IP>/data/candles/RELIANCE.json | head -c 200
curl -sI http://<VM_IP>/data/candles/RELIANCE.json | grep -i access-control
```
You should see candle JSON and an `Access-Control-Allow-Origin: *` header.

## 9. (Recommended) Add HTTPS

Needs a domain pointed at `<VM_IP>` (an A record). Then:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```
Certbot edits the nginx config and auto-renews. Your base URL becomes
`https://<your-domain>/data`.

## 10. Give me the base URL

The value I bake into the app (`VITE_CANDLE_BASE`) is the base **above** the
`candles/` folder:

| You serve | VITE_CANDLE_BASE |
|-----------|------------------|
| `http://<VM_IP>/data/candles/RELIANCE.json` | `http://<VM_IP>/data` |
| `https://<your-domain>/data/candles/RELIANCE.json` | `https://<your-domain>/data` |

Send me that base URL and I'll rebuild the APK so charts stream from your host.

---

### Notes
- For **HTTP (no domain) testing**, the app already allows cleartext on Android
  (`allowMixedContent`/`cleartext` are on), so `http://<VM_IP>/data` works for a
  test build. Switch to HTTPS before any public release.
- To **refresh data** later: re-run `taureye export --all --out C:\TAUREYE\taureye-host-data`
  on the PC (it has the EOD database), then re-upload. The VM only serves files.
- Other free hosts that also work (static files + CORS): Cloudflare R2 +
  Workers, GitHub Pages (≤1 GB, but many small files is slow), Netlify,
  Backblaze B2. Oracle is the simplest for a full nginx box you control.
