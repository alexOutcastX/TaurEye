# Hosting TaurEye on an Azure VM with Docker (self-hosted Supabase)

One Ubuntu VM runs **everything in Docker**: the static SPA + `/data` bundle
(**nginx**, published on :80), the **data engine** (nightly EOD → SQLite → JSON
bundle), and a **self-hosted Supabase** stack (auth + Postgres
wallet/portfolio/credits). Served over **HTTP on the VM's public IP** for now;
add TLS to nginx when you get a domain (see the HTTPS section below).

```
                  ┌──────────── Azure VM (Ubuntu 22.04 + Docker) ────────────┐
  Browser ──:80───► web (nginx: SPA + /data)                                 │
  Browser ──:8000──► Supabase Kong ──► auth · rest · realtime · storage · db  │
                  │   web ──reads── [data/bundle] ──written by── dataengine    │
                  │   scheduler (ofelia) ── nightly exec ──► dataengine        │
                  └──────────────────────────────────────────────────────────┘
```

Files live in **`deploy/azure/`**: `bootstrap.sh`, `Dockerfile.web`,
`docker-compose.yml`, `.env.example`, `up.sh`, `down.sh`.

> Steps 1–2 (Azure account / VM) are yours — the rest is copy-paste on the VM.

---

## ⚡ One-command setup (recommended)
After the VM exists (Phases 1–2 below) and the **whole TaurEye folder is on the
VM**, this single command does everything — installs Docker, generates all
Supabase secrets (incl. the anon/service JWTs), detects the public IP, writes
both `.env` files, starts Supabase + the app, applies the schema, and builds the
first data bundle:

```bash
bash deploy/azure/bootstrap.sh
```

- **Idempotent** — safe to re-run; it keeps existing secrets/data.
- **Provide your data (optional):** put your spine at
  `deploy/azure/data/spine/market.db` (or `backend/data/market.db` — it'll copy
  it). No DB? It builds one from scratch (slow).
- **IP override** if auto-detect fails: `PUBLIC_IP=<vm-ip> bash deploy/azure/bootstrap.sh`
- **Still required by hand:** open NSG ports **80 + 8000** (Phase 2), and set
  `SMTP_*` in `deploy/azure/supabase-docker/.env` for real auth emails (the
  script enables email auto-confirm so signups work without SMTP meanwhile).

The manual phases below are the same steps, broken out, if you prefer to run them
yourself or need to debug.

---

## 1. Create the VM (one-time)
- **Region: Central India (Pune)** or **West India (Mumbai)**. This matters — the
  data engine fetches **BSE market-cap/SENSEX + NSE bhavcopy**, which must be
  reachable from India. A US/EU region will make those pulls fail.
- **Image:** Ubuntu 22.04 LTS.
- **Size:** self-hosting Supabase is the memory driver. **Standard B2ms (2 vCPU /
  8 GB)** comfortable minimum; **B4ms (4 / 16 GB)** roomy. (B2s 4 GB only if you
  later move Supabase to the cloud.)
- **Disk:** add a **managed data disk** (e.g. 64 GB) for Postgres + `market.db` +
  the bundle, so they survive VM resizes; enable snapshots for backup.
- Add your **SSH public key**. Note the **public IP** after it boots.

## 2. Open ports (Azure NSG — the only firewall layer)
Networking → the VM's **Network Security Group** → add inbound rules:
`22` (SSH), `80` (web), `8000` (Supabase). Add `443` later with a domain.
(Azure's stock Ubuntu image doesn't double-block with iptables like Oracle does.)

## 3. Install Docker (on the VM)
```bash
ssh azureuser@YOUR_VM_IP
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Get the code + the Supabase stack
```bash
git clone https://github.com/alexOutcastX/TaurEye taureye && cd taureye/deploy/azure
# The official Supabase self-host compose, dropped in as ./supabase-docker:
git clone --depth 1 https://github.com/supabase/supabase tmp-supabase
mv tmp-supabase/docker supabase-docker && rm -rf tmp-supabase
cp supabase-docker/.env.example supabase-docker/.env
```

## 5. Configure Supabase (`supabase-docker/.env`)
Set **strong** values (never the demo defaults):
- `POSTGRES_PASSWORD` — strong random.
- `JWT_SECRET` — 40+ random chars.
- `ANON_KEY` / `SERVICE_ROLE_KEY` — JWTs signed with `JWT_SECRET` (roles `anon` /
  `service_role`). Generate with the tool at
  https://supabase.com/docs/guides/self-hosting/docker.
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` — Studio login.
- Public URLs (IP + HTTP for now):
  `API_EXTERNAL_URL=http://YOUR_VM_IP:8000`,
  `SUPABASE_PUBLIC_URL=http://YOUR_VM_IP:8000`,
  `SITE_URL=http://YOUR_VM_IP` (the SPA origin).
- `SMTP_*` — your email provider (Brevo/Resend/SES free tier) for auth emails.

## 6. Configure the TaurEye app stack (`deploy/azure/.env`)
```bash
cp .env.example .env
```
Set:
- `AZURE_PUBLIC_IP=YOUR_VM_IP`
- `VITE_SUPABASE_ANON_KEY=` the **ANON_KEY** you just put in `supabase-docker/.env`
- `VITE_AI_MODE=cache` (self-host = ₹0, no Edge Functions)

## 7. Seed the SQLite spine
The engine needs a starting `market.db`. Either copy yours up:
```bash
mkdir -p deploy/azure/data/spine
scp backend/data/market.db azureuser@YOUR_VM_IP:~/taureye/deploy/azure/data/spine/market.db
```
…or let the first nightly build it from scratch (slower; the site is empty until
the first export in step 9).

## 8. Bring it all up
```bash
chmod +x up.sh down.sh
./up.sh            # Supabase first, then build + start the app stack
docker compose ps  # web / dataengine / scheduler healthy?
```

## 9. Apply the schema + first data export
Schema, **in this exact order**, via the Supabase Studio SQL editor
(`http://YOUR_VM_IP:8000`) or psql:
```bash
for f in schema credits referrals subscriptions harden-grants; do
  docker compose -f supabase-docker/docker-compose.yml exec -T db \
    psql -U postgres -d postgres < ../../supabase/$f.sql
done
```
First JSON bundle (so the screener has data immediately, not just at 21:00 IST):
```bash
docker compose exec dataengine bash -lc \
  "python -m backend.app.dataengine.run nightly && \
   python -m backend.app.dataengine.run export --all --gz --out /data/bundle"
```

## 10. Verify
- `curl -s http://YOUR_VM_IP/data/manifest.json | head` → JSON, not 404.
- Open `http://YOUR_VM_IP/` → screener loads; charts render.
- Sign up → confirm `auth.users` + `public.profiles` populate and signup-bonus
  credits appear (the credit economy works with **zero** Edge Functions).

## 11. Repoint the published builds (web + APK)
The web/APK currently target the old Oracle IP. Update GitHub → **Settings →
Secrets and variables → Actions**:
- `VITE_SUPABASE_URL = http://YOUR_VM_IP:8000`, `VITE_SUPABASE_ANON_KEY = <anon>`
- `VITE_DATA_BASE` / `VITE_CANDLE_BASE` → `http://YOUR_VM_IP/data` (for the APK/OTA
  build; the VM-served web uses same-origin `/data` already).
Then push to `main` → web deploy + Capgo OTA ship the new endpoints. A **fresh
APK** is only needed if you change native config (`capacitor.config.ts`).

> In this all-in-one model the web is built **on the VM** by `docker compose`, so
> the legacy CI rsync (`deploy.yml` → native nginx) is redundant — to redeploy
> code: `git pull && docker compose up -d --build web`.

## 12. Backups (self-hosting = DR is yours)
```bash
# nightly Postgres dump (add to crontab)
docker compose -f deploy/azure/supabase-docker/docker-compose.yml exec -T db \
  pg_dump -U postgres -Fc postgres > ~/backups/taureye-$(date +%F).dump
```
Plus Azure **disk snapshots** of the data disk (covers `market.db` + the bundle).

---

## Going HTTPS later (recommended once you have a domain) — still nginx
1. Point an A record at the VM IP; open `443` in the NSG and uncomment `443:443`
   on the `web` service in `docker-compose.yml`.
2. Add a TLS server block to nginx. Easiest path: run **certbot** in nginx mode on
   the host, or add a small companion container
   (`nginxproxy/nginx-proxy` + `acme-companion`, or certbot) that obtains and
   renews a Let's Encrypt cert and mounts it into the `web` container. Add a
   `server { listen 443 ssl; ... }` block alongside the existing `:80` server in
   `deploy/nginx-taureye.conf`.
3. Rebuild the web with `VITE_SUPABASE_URL=https://api.<domain>` and put TLS in
   front of Kong:8000 too; set the same URLs in Supabase `*_EXTERNAL_URL`.
4. Drop `cleartext: true` from `capacitor.config.ts` and rebuild the APK once.

## Gotchas (read before you start)
- **India region** is mandatory for the BSE/NSE fetches (see step 1).
- **RAM:** the Supabase stack is ~6 containers (~2–4 GB) + the engine — don't go
  below 8 GB while self-hosting.
- **Secrets:** regenerate **all** Supabase keys for production; never commit
  `deploy/azure/.env` or `supabase-docker/.env` (both gitignored).
- **First load is empty** until step 9's export runs — `/data` is a runtime
  volume, nothing is baked into the image.
