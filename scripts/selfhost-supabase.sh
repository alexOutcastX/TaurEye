#!/usr/bin/env bash
# One-shot self-host of Supabase for TaurEye.
#
# Does EVERYTHING for you on a machine with Docker:
#   1. generates JWT_SECRET + POSTGRES_PASSWORD + dashboard password
#   2. signs the ANON_KEY / SERVICE_ROLE_KEY JWTs (no web tool needed)
#   3. clones the official supabase/docker stack and writes its .env
#   4. docker compose up -d  (Postgres + GoTrue + PostgREST + Studio + Kong)
#   5. waits for the DB, applies the TaurEye schema IN ORDER
#   6. writes the app's .env.local so `npm run dev` just works
#
# Run it on YOUR machine (it needs a persistent Docker host):
#   ./scripts/selfhost-supabase.sh
#
# Re-runnable. Tear down later with:  cd selfhost/supabase/docker && docker compose down
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPADIR="${SUPADIR:-$REPO/selfhost}"          # where the supabase/docker clone lives
API_PORT="${API_PORT:-8000}"
API_URL="http://localhost:${API_PORT}"

say() { printf "\n\033[1;32m▶ %s\033[0m\n" "$*"; }
die() { printf "\n\033[1;31m✖ %s\033[0m\n" "$*" >&2; exit 1; }

# ---- prereqs ----
command -v git >/dev/null || die "git not found"
command -v openssl >/dev/null || die "openssl not found"
command -v docker >/dev/null || die "docker not found — install Docker Desktop / Docker Engine"
docker info >/dev/null 2>&1 || die "the Docker daemon isn't running — start Docker, then re-run"
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else command -v docker-compose >/dev/null && DC="docker-compose" || die "docker compose not found"; fi

# ---- secret + JWT generation (HS256, no deps) ----
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
JWT_SECRET="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)"
PG_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"
DASH_PASS="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 18)"
IAT="$(date +%s)"; EXP="$((IAT + 315360000))"   # +10 years
HDR="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)"
mkjwt() {
  local pl sig
  pl="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$IAT" "$EXP" | b64url)"
  sig="$(printf '%s' "$HDR.$pl" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)"
  printf '%s' "$HDR.$pl.$sig"
}
ANON_KEY="$(mkjwt anon)"
SERVICE_KEY="$(mkjwt service_role)"

# ---- clone the official stack ----
say "Cloning supabase/docker into $SUPADIR"
mkdir -p "$SUPADIR"
if [ ! -d "$SUPADIR/supabase/.git" ]; then
  git clone --depth 1 https://github.com/supabase/supabase "$SUPADIR/supabase"
fi
DOCKERDIR="$SUPADIR/supabase/docker"
[ -f "$DOCKERDIR/.env.example" ] || die "supabase/docker/.env.example missing — clone failed?"
cp -n "$DOCKERDIR/.env.example" "$DOCKERDIR/.env" 2>/dev/null || true

# ---- write the .env values ----
setenv() { # setenv KEY VALUE  — replace KEY=... in the .env (or append)
  local k="$1" v="$2" f="$DOCKERDIR/.env"
  if grep -q "^${k}=" "$f"; then
    # use a temp file to avoid sed delimiter issues with / and +
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  else
    printf '%s=%s\n' "$k" "$v" >> "$f"
  fi
}
say "Writing $DOCKERDIR/.env"
setenv POSTGRES_PASSWORD "$PG_PASS"
setenv JWT_SECRET "$JWT_SECRET"
setenv ANON_KEY "$ANON_KEY"
setenv SERVICE_ROLE_KEY "$SERVICE_KEY"
setenv DASHBOARD_USERNAME "supabase"
setenv DASHBOARD_PASSWORD "$DASH_PASS"
setenv SITE_URL "http://localhost:5174"
setenv API_EXTERNAL_URL "$API_URL"
setenv SUPABASE_PUBLIC_URL "$API_URL"
setenv ENABLE_EMAIL_AUTOCONFIRM "true"   # local dev: sign in works without SMTP

# ---- bring it up ----
say "docker compose pull (first run downloads images)"
( cd "$DOCKERDIR" && $DC pull )
say "docker compose up -d"
( cd "$DOCKERDIR" && $DC up -d )

# ---- wait for Postgres ----
say "Waiting for Postgres to be ready…"
for i in $(seq 1 60); do
  if ( cd "$DOCKERDIR" && $DC exec -T db pg_isready -U postgres >/dev/null 2>&1 ); then break; fi
  sleep 3
  [ "$i" = 60 ] && die "Postgres didn't come up in time — check: cd $DOCKERDIR && $DC logs db"
done

# ---- apply the TaurEye schema, in order ----
say "Applying TaurEye schema"
for f in schema credits referrals subscriptions harden-grants; do
  sql="$REPO/supabase/$f.sql"
  if [ -f "$sql" ]; then
    printf "   • %s.sql\n" "$f"
    ( cd "$DOCKERDIR" && $DC exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres ) < "$sql" >/dev/null \
      || die "failed applying $f.sql"
  fi
done

# ---- wire the app ----
say "Writing $REPO/.env.local"
cat > "$REPO/.env.local" <<EOF
VITE_DATA_SOURCE=local
VITE_SUPABASE_URL=$API_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF

# ---- save the secrets ----
cat > "$SUPADIR/credentials.txt" <<EOF
TaurEye self-hosted Supabase — KEEP SECRET, do not commit
API / Studio URL : $API_URL
Studio login     : supabase / $DASH_PASS
ANON_KEY         : $ANON_KEY
SERVICE_ROLE_KEY : $SERVICE_KEY
JWT_SECRET       : $JWT_SECRET
POSTGRES_PASSWORD: $PG_PASS
EOF
chmod 600 "$SUPADIR/credentials.txt"

cat <<EOF

✅ Done. Supabase is self-hosted and seeded with the TaurEye schema.

   Studio (dashboard): $API_URL    (login: supabase / $DASH_PASS)
   App is wired via .env.local — now run:  npm run dev
   Secrets saved to: $SUPADIR/credentials.txt

   Verify:  SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY ./scripts/check-backend.sh
   Stop:    cd $DOCKERDIR && $DC down       (data persists)
   To cloud later: copy $DOCKERDIR + .env to your VM, pg_dump/restore, repoint env (see docs/SELF-HOST-SUPABASE.md).
EOF
