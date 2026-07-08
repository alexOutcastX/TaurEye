#!/usr/bin/env bash
# Enable a social login provider on the self-hosted Supabase (GoTrue). ADDITIVE:
# each call adds/updates ONE provider without disturbing the others. Run on the VM:
#
#   bash deploy/azure/enable-oauth.sh <provider> <client_id> <secret>
#
# Providers:  google | twitter | apple | facebook | github     (twitter = X)
#   twitter : OAuth 1.0a — <client_id> = API Key, <secret> = API Key Secret.
#   apple   : <secret> is the generated ES256 client-secret JWT (see the PDF).
#   others  : <client_id> = OAuth client/app id, <secret> = client/app secret.
#
# Console redirect URI for EVERY provider:
#   https://api.taureye.com/auth/v1/callback
#
# After enabling, add the provider to VITE_OAUTH_PROVIDERS in deploy/azure/.env
# and rebuild web so its button appears:
#   cd deploy/azure && sudo docker compose up -d --build web
set -euo pipefail

PROVIDER="${1:?usage: enable-oauth.sh <google|twitter|apple|facebook|github> <client_id> <secret>}"
CID="${2:?client id required}"
SECRET="${3:?secret required}"

case "$PROVIDER" in
  google|twitter|apple|facebook|github) ;;
  *) echo "!! unknown provider '$PROVIDER' (google|twitter|apple|facebook|github)"; exit 1 ;;
esac

cd "$(dirname "$0")/supabase-docker"
STORE=.oauth-providers            # provider<TAB>client_id<TAB>secret  (secrets — chmod 600)
OVR=docker-compose.override.yml
touch "$STORE"; chmod 600 "$STORE"

# Upsert this provider into the store (drop any prior line for it). awk keeps it
# portable (no grep -P dependency).
tmp="$(mktemp)"
awk -F'\t' -v p="$PROVIDER" '$1!=p' "$STORE" > "$tmp" || true
printf '%s\t%s\t%s\n' "$PROVIDER" "$CID" "$SECRET" >> "$tmp"
mv "$tmp" "$STORE"; chmod 600 "$STORE"

# Preserve a Kong-localhost binding if harden.sh already wrote one.
KONG_BLOCK=""
if [ -f "$OVR" ] && grep -q 'kong:' "$OVR"; then
  KONG_BLOCK=$'  kong:\n    ports: !override\n      - "127.0.0.1:8000:8000"\n'
fi

# Regenerate the override from ALL stored providers.
{
  echo "# Managed by enable-oauth.sh (+ harden.sh). Do not edit by hand."
  echo "services:"
  printf '%s' "$KONG_BLOCK"
  echo "  auth:"
  echo "    environment:"
  echo "      GOTRUE_API_EXTERNAL_URL: \"https://api.taureye.com\""
  echo "      API_EXTERNAL_URL: \"https://api.taureye.com\""
  echo "      GOTRUE_SITE_URL: \"https://taureye.com\""
  # Allow the web post-login redirect AND the native APK deep link.
  echo "      GOTRUE_URI_ALLOW_LIST: \"https://taureye.com,https://taureye.com/**,app.taureye.mobile://**\""
  while IFS=$'\t' read -r p id sec; do
    [ -z "$p" ] && continue
    UP="$(printf '%s' "$p" | tr '[:lower:]' '[:upper:]')"
    echo "      GOTRUE_EXTERNAL_${UP}_ENABLED: \"true\""
    echo "      GOTRUE_EXTERNAL_${UP}_CLIENT_ID: \"${id}\""
    echo "      GOTRUE_EXTERNAL_${UP}_SECRET: \"${sec}\""
    echo "      GOTRUE_EXTERNAL_${UP}_REDIRECT_URI: \"https://api.taureye.com/auth/v1/callback\""
  done < "$STORE"
} > "$OVR"

echo "==> Wrote $OVR. Enabled providers: $(cut -f1 "$STORE" | paste -sd, -)"

# Supabase's .env pins an explicit COMPOSE_FILE list, which DISABLES compose's
# automatic docker-compose.override.yml pickup — append ours or the override
# silently never applies.
if grep -q '^COMPOSE_FILE=' .env 2>/dev/null \
   && ! grep '^COMPOSE_FILE=' .env | grep -q 'docker-compose.override.yml'; then
  sed -i 's|^COMPOSE_FILE=.*|&:docker-compose.override.yml|' .env
  echo "==> Appended docker-compose.override.yml to COMPOSE_FILE in supabase-docker/.env"
fi

echo "==> Restarting auth..."
sudo docker compose up -d --force-recreate auth
sleep 5
echo "==> Verify (want \"${PROVIDER}\":true):"
# Kong requires an API key even on /settings — read the anon key from the app .env.
ANON="$(grep '^VITE_SUPABASE_ANON_KEY=' ../.env 2>/dev/null | head -1 | cut -d= -f2-)"
curl -s https://api.taureye.com/auth/v1/settings ${ANON:+-H "apikey: $ANON"} \
  | grep -o "\"${PROVIDER}\":[a-z]*" \
  || echo "(could not read settings — check 'docker compose logs auth')"
echo
echo "Next: make sure VITE_OAUTH_PROVIDERS in deploy/azure/.env lists '$PROVIDER', then:"
echo "  cd \"$(dirname "$(pwd)")\" && sudo docker compose up -d --build web"
