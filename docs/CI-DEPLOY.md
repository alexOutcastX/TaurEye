# Auto-deploy: edit → push → live on the VM

**Hosting model: static.** nginx serves the built SPA plus a precomputed JSON
bundle under `/data`. The screener and charts run **client-side** off that
bundle, so there is no live application backend to run or restart — which keeps
the tiny (≈0.5 GB RAM) VM fast and robust. A nightly cron on the VM regenerates
the bundle; GitHub Actions publishes new SPA builds on every push.

```
You (laptop) --git push--> GitHub --Actions(build SPA, VITE_DATA_SOURCE=local)--> rsync --> nginx web root
VM cron (refresh.sh, nightly) --> pull EOD --> export JSON bundle --> nginx /data --> users auto-update
```

The app lives in **`/opt/taureye`** (a system path), NOT your home dir: Oracle
Linux runs SELinux in enforcing mode and denies cron/services that read or
execute out of `/home` (`user_home_t`).

## One-time setup

### 1. Push the repo to GitHub
```
git remote add origin git@github.com:<you>/taureye.git
git push -u origin main
```

### 2. Prepare the VM (once)
Copy the repo's `deploy/` to the VM and run the setup script:
```
scp -i <key> -r deploy <user>@<vm-host>:/tmp/deploy
ssh -i <key> <user>@<vm-host>
bash /tmp/deploy/setup-vm.sh
```
This installs nginx + Python, creates the venv at `/opt/taureye/venv`, installs
the nginx site (SPA + `/data`), makes the web root writable by the deploy user,
installs `refresh.sh`, opens 80/443, fixes SELinux contexts, and adds the
nightly refresh cron. Then:
- Open **ports 80/443 in the Oracle VCN Security List** (cloud firewall).
- `scp` your `market.db` to `/opt/taureye/data/market.db` (once).
- Seed the first bundle: `/opt/taureye/refresh.sh`.

### 3. A deploy SSH key
```
ssh-keygen -t ed25519 -f ~/deploy_key -N ""          # run anywhere
cat ~/deploy_key.pub >> ~/.ssh/authorized_keys        # on the VM
```
Keep the **private** key (`~/deploy_key`) for the GitHub secret below.

### 4. GitHub repo secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `VM_HOST` | your VM's host/IP (e.g. `taureye.com`) |
| `VM_USER` | your VM user (`opc`) |
| `VM_SSH_KEY` | contents of the **private** deploy key |
| `VITE_API_KEY` | (optional; static build doesn't call a backend) |
| `VITE_SUPABASE_URL` | (optional, when Supabase is set up) |
| `VITE_SUPABASE_ANON_KEY` | (optional) |

## After that — every change is automatic
```
git add -A && git commit -m "what changed" && git push
```
GitHub Actions (`.github/workflows/deploy.yml`) builds the SPA with
`VITE_DATA_SOURCE=local` and rsyncs it to the nginx web root (**excluding
`data/`**, so the live bundle is never clobbered), then reloads nginx. The site
at `https://taureye.com` updates in ~1 min. Watch the repo's **Actions** tab.

## Notes
- **Same-origin data.** The SPA reads `/data/*.json` from the same host; no IP is
  baked into the build (the APK is built separately with `VITE_DATA_BASE`/
  `VITE_CANDLE_BASE` pointing at the VM).
- **Data freshness** is owned entirely by the nightly `refresh.sh` cron; deploys
  never touch `/data`. To refresh on demand: `ssh … '/opt/taureye/refresh.sh'`.
- **HTTPS:** point a domain (or DuckDNS) at the VM and switch nginx to TLS (or
  front it with Caddy/certbot) — the bare-IP `:80` config is the default.
- The 0.5 GB VM never builds the frontend (GitHub does) and runs no resident
  Python service, so it won't OOM.
