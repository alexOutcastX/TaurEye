# Auto-deploy: edit → push → live on the VM

Flow: you edit locally → `git push` to GitHub `main` → **GitHub Actions** builds
the web app and ships it (plus backend code) to the VM → restarts the API →
users see the update. The VM's database is preserved across deploys.

```
You (laptop) --git push--> GitHub --Actions(build+rsync+restart)--> VM (Caddy + uvicorn) --> users
```

## One-time setup

### 1. Push the repo to GitHub
Create a **private** repo and push (from `TaurEye_final/TaurEye`):
```
git remote add origin https://github.com/<you>/taureye.git
git push -u origin main
```

### 2. Prepare the VM (once)
Copy the repo's `deploy/` to the VM (or just the script) and run it:
```
scp -i <key> -r deploy <user>@161.118.174.177:~/taureye/deploy
ssh -i <key> <user>@161.118.174.177
bash ~/taureye/deploy/setup-vm.sh
```
This installs Caddy + Python, creates the venv, registers the `taureye-api`
service, configures Caddy (web + `/api` proxy), opens 80/443, and adds the
nightly data-refresh cron. Then:
- Open **ports 80/443 in the Oracle VCN Security List** (cloud firewall).
- `scp` your `market.db` to `~/taureye/backend/data/market.db` (once).
- Put real secrets in `~/taureye/.env.server` (`TAUREYE_API_KEY`, `TAUREYE_AI_KEY`).
- `sudo systemctl start taureye-api`

### 3. A deploy SSH key
On the VM, allow a deploy key (so Actions can connect):
```
ssh-keygen -t ed25519 -f ~/deploy_key -N ""        # run anywhere
# add the PUBLIC key to the VM:
cat ~/deploy_key.pub >> ~/.ssh/authorized_keys      # on the VM
```
Keep the **private** key (`~/deploy_key`) for the GitHub secret below.

### 4. GitHub repo secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `VM_HOST` | `161.118.174.177` |
| `VM_USER` | your VM user (`opc` or `ubuntu`) |
| `VM_SSH_KEY` | contents of the **private** deploy key |
| `VITE_API_KEY` | same as the backend's `TAUREYE_API_KEY` (or blank) |
| `VITE_SUPABASE_URL` | (optional, when Supabase is set up) |
| `VITE_SUPABASE_ANON_KEY` | (optional) |

## After that — every change is automatic
```
# edit code...
git add -A && git commit -m "what changed" && git push
```
GitHub Actions (`.github/workflows/deploy.yml`) builds + deploys; the site at
`http://161.118.174.177` updates in ~1–2 min. Watch progress in the repo's
**Actions** tab. You can also trigger it manually (Actions → Deploy to VM → Run).

## Notes
- The web app is served **same-origin**, so it calls `/api` on the VM (no IP baked
  into the build). The **APK** still needs an absolute `VITE_API_BASE` — build that
  separately with `VITE_API_BASE=http://161.118.174.177` (or your domain).
- For **HTTPS**, point a domain (or DuckDNS) at the VM and change `:80` to that
  hostname in `/etc/caddy/Caddyfile` — Caddy auto-issues a certificate.
- Data refresh runs nightly on the VM and restarts the API; deploys never touch
  `backend/data`.
- The 1 GB VM never builds the frontend (GitHub does), so it won't OOM on deploy.
