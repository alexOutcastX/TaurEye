#!/usr/bin/env bash
# TaurEye — ONE-SHOT Azure VM setup.
#
#   1. Upload the WHOLE TaurEye folder to the VM (scp/rsync/git clone).
#   2. (optional) drop your SQLite spine at deploy/azure/data/spine/market.db
#      — or at backend/data/market.db and this script will copy it for you.
#   3. Run:   bash deploy/azure/bootstrap.sh
#
# It is idempotent: re-running keeps existing secrets/data and just reconciles.
# Override the public IP if auto-detect fails:   PUBLIC_IP=1.2.3.4 bash bootstrap.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
mkdir -p .state data/spine data/bundle

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Docker + git (install if missing)
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker, compose and git…"
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2 git openssl python3 curl
  sudo systemctl enable --now docker || true
  sudo usermod -aG docker "$USER" || true
fi

# This shell may not have the docker group active yet → fall back to sudo.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"; else
    warn "Docker daemon not reachable. Is it running?"; exit 1
  fi
fi
sup() { ( cd "$HERE/supabase-docker" && $DOCKER compose "$@" ); }   # Supabase stack
app() { $DOCKER compose "$@"; }                                     # TaurEye app stack

# ---------------------------------------------------------------------------
# Helpers: dotenv upsert + HS256 JWT (signed with JWT_SECRET), pure stdlib
# ---------------------------------------------------------------------------
set_env() {  # set_env <file> <key> <value>
  python3 - "$1" "$2" "$3" <<'PY'
import sys, os
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines() if os.path.exists(path) else []
out, found = [], False
for ln in lines:
    if ln.startswith(key + "="):
        out.append(f"{key}={val}"); found = True
    else:
        out.append(ln)
if not found:
    out.append(f"{key}={val}")
open(path, "w").write("\n".join(out) + "\n")
PY
}
gen_jwt() {  # gen_jwt <jwt_secret> <role>
  JWT_SECRET="$1" ROLE="$2" python3 - <<'PY'
import os, time, json, hmac, hashlib, base64
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=')
secret = os.environ['JWT_SECRET'].encode()
now = int(time.time())
hdr = {"alg": "HS256", "typ": "JWT"}
pl  = {"role": os.environ['ROLE'], "iss": "supabase", "iat": now, "exp": now + 10*365*24*3600}
seg = b64(json.dumps(hdr, separators=(',', ':')).encode()) + b'.' + b64(json.dumps(pl, separators=(',', ':')).encode())
sig = b64(hmac.new(secret, seg, hashlib.sha256).digest())
print((seg + b'.' + sig).decode())
PY
}

# ---------------------------------------------------------------------------
# 2. Public IP (Azure IMDS → ifconfig.me → require PUBLIC_IP)
# ---------------------------------------------------------------------------
PUBLIC_IP="${PUBLIC_IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -s -H Metadata:true --noproxy '*' \
    'http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2021-02-01&format=text' 2>/dev/null || true)"
fi
[ -z "$PUBLIC_IP" ] && PUBLIC_IP="$(curl -s --max-time 5 ifconfig.me 2>/dev/null || true)"
if [ -z "$PUBLIC_IP" ]; then
  warn "Could not auto-detect the public IP. Re-run as:  PUBLIC_IP=<your.vm.ip> bash deploy/azure/bootstrap.sh"
  exit 1
fi
log "Public IP: $PUBLIC_IP"

# ---------------------------------------------------------------------------
# 3. Supabase self-host compose (clone once)
# ---------------------------------------------------------------------------
if [ ! -d supabase-docker ]; then
  log "Fetching the Supabase self-host stack…"
  git clone --depth 1 https://github.com/supabase/supabase tmp-supabase
  mv tmp-supabase/docker supabase-docker
  rm -rf tmp-supabase
fi

# ---------------------------------------------------------------------------
# 4. Supabase secrets (generate ONCE; reuse on re-runs)
# ---------------------------------------------------------------------------
SENV="supabase-docker/.env"
if [ ! -f "$SENV" ] || ! grep -q '^JWT_SECRET=.\{20,\}' "$SENV"; then
  log "Generating Supabase secrets (first run)…"
  cp -f supabase-docker/.env.example "$SENV"

  JWT_SECRET="$(openssl rand -hex 32)"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  DASHBOARD_PASSWORD="$(openssl rand -hex 12)"
  ANON_KEY="$(gen_jwt "$JWT_SECRET" anon)"
  SERVICE_ROLE_KEY="$(gen_jwt "$JWT_SECRET" service_role)"

  set_env "$SENV" JWT_SECRET           "$JWT_SECRET"
  set_env "$SENV" POSTGRES_PASSWORD    "$POSTGRES_PASSWORD"
  set_env "$SENV" ANON_KEY             "$ANON_KEY"
  set_env "$SENV" SERVICE_ROLE_KEY     "$SERVICE_ROLE_KEY"
  set_env "$SENV" DASHBOARD_USERNAME   "supabase"
  set_env "$SENV" DASHBOARD_PASSWORD   "$DASHBOARD_PASSWORD"
  # newer Supabase needs these too — harmless if the version ignores them
  set_env "$SENV" SECRET_KEY_BASE      "$(openssl rand -hex 32)"
  set_env "$SENV" VAULT_ENC_KEY        "$(openssl rand -hex 16)"
  # let signups work WITHOUT configuring SMTP (flip off once SMTP is set)
  set_env "$SENV" ENABLE_EMAIL_AUTOCONFIRM "true"
fi

# Always reconcile the public URLs to the current IP.
set_env "$SENV" API_EXTERNAL_URL    "http://$PUBLIC_IP:8000"
set_env "$SENV" SUPABASE_PUBLIC_URL "http://$PUBLIC_IP:8000"
set_env "$SENV" SITE_URL            "http://$PUBLIC_IP"

ANON_KEY="$(grep '^ANON_KEY=' "$SENV" | cut -d= -f2-)"
DASHBOARD_PASSWORD="$(grep '^DASHBOARD_PASSWORD=' "$SENV" | cut -d= -f2-)"

# ---------------------------------------------------------------------------
# 5. TaurEye app .env (consumed by docker-compose.yml at build time)
# ---------------------------------------------------------------------------
[ -f .env ] || cp .env.example .env
set_env .env AZURE_PUBLIC_IP         "$PUBLIC_IP"
set_env .env VITE_SUPABASE_ANON_KEY  "$ANON_KEY"
set_env .env VITE_AI_MODE            "cache"

# ---------------------------------------------------------------------------
# 6. Seed the SQLite spine if one was provided elsewhere
# ---------------------------------------------------------------------------
if [ ! -f data/spine/market.db ] && [ -f "$REPO_ROOT/backend/data/market.db" ]; then
  log "Copying backend/data/market.db into the spine volume…"
  cp "$REPO_ROOT/backend/data/market.db" data/spine/market.db
fi

# ---------------------------------------------------------------------------
# 7. Bring up Supabase, wait for Postgres, apply schema (once)
# ---------------------------------------------------------------------------
log "Starting Supabase…"
sup up -d

log "Waiting for Postgres to accept connections…"
for _ in $(seq 1 60); do
  sup exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 3
done

if [ ! -f .state/schema-applied ]; then
  log "Applying the TaurEye schema (schema → credits → referrals → subscriptions → harden-grants)…"
  for f in schema credits referrals subscriptions harden-grants; do
    sup exec -T db psql -U postgres -d postgres < "$REPO_ROOT/supabase/$f.sql"
  done
  touch .state/schema-applied
else
  log "Schema already applied — skipping."
fi

# ---------------------------------------------------------------------------
# 8. Build + start the TaurEye app stack (web + dataengine + scheduler)
# ---------------------------------------------------------------------------
log "Building + starting the TaurEye app stack (first build takes a few minutes)…"
app up -d --build

# ---------------------------------------------------------------------------
# 9. First data bundle (builds market.db from scratch if you didn't provide one)
# ---------------------------------------------------------------------------
if [ -f data/spine/market.db ]; then
  log "Exporting the JSON bundle from the existing spine…"
  app exec -T dataengine bash -lc \
    "python -m backend.app.dataengine.run export --all --gz --out /data/bundle"
else
  warn "No market.db provided — building one from scratch now (this is slow; grab a coffee)…"
  app exec -T dataengine bash -lc \
    "python -m backend.app.dataengine.run nightly && \
     python -m backend.app.dataengine.run export --all --gz --out /data/bundle"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
printf '\n\033[1;32m======================================================================\n'
printf ' TaurEye is up.\n'
printf '======================================================================\033[0m\n'
printf ' Web app        : http://%s/\n' "$PUBLIC_IP"
printf ' Supabase Studio: http://%s:8000   (user: supabase  pass: %s)\n' "$PUBLIC_IP" "$DASHBOARD_PASSWORD"
printf '\n'
printf ' Make sure the Azure NSG allows inbound TCP 80 and 8000 (and 22 for SSH).\n'
printf ' Nightly data refresh runs automatically at 21:00 IST.\n'
printf ' Secrets live in deploy/azure/.env and deploy/azure/supabase-docker/.env (gitignored).\n\n'
