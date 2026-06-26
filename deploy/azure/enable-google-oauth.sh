#!/usr/bin/env bash
# Enable Google sign-in on the self-hosted Supabase. Run on the VM:
#   bash deploy/azure/enable-google-oauth.sh "<GOOGLE_CLIENT_ID>" "<GOOGLE_CLIENT_SECRET>"
#
# Prereqs (do these in the browser first):
#   - Google Cloud OAuth "Web application" client with:
#       Authorized redirect URI:  https://api.taureye.com/auth/v1/callback
#       Authorized JS origin:     https://taureye.com
#   - Your old accounts were migrated (auth.users/identities) — Google users match by email.
set -euo pipefail
CID="${1:?usage: enable-google-oauth.sh <CLIENT_ID> <CLIENT_SECRET>}"
SECRET="${2:?usage: enable-google-oauth.sh <CLIENT_ID> <CLIENT_SECRET>}"
cd "$(dirname "$0")/supabase-docker"
OVR=docker-compose.override.yml

# Preserve a Kong-localhost binding if harden.sh already wrote one.
KONG_BLOCK=""
if [ -f "$OVR" ] && grep -q 'kong:' "$OVR"; then
  KONG_BLOCK=$'  kong:\n    ports: !override\n      - "127.0.0.1:8000:8000"\n'
fi

{
  echo "# Managed by enable-google-oauth.sh (+ harden.sh)"
  echo "services:"
  printf '%s' "$KONG_BLOCK"
  cat <<YAML
  auth:
    environment:
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: "${CID}"
      GOTRUE_EXTERNAL_GOOGLE_SECRET: "${SECRET}"
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: "https://api.taureye.com/auth/v1/callback"
      # Build callback/redirect URLs as HTTPS even though nginx->Kong is http internally.
      GOTRUE_API_EXTERNAL_URL: "https://api.taureye.com"
      API_EXTERNAL_URL: "https://api.taureye.com"
      GOTRUE_SITE_URL: "https://taureye.com"
      # Allow the app's post-login redirect target.
      GOTRUE_URI_ALLOW_LIST: "https://taureye.com,https://taureye.com/**"
YAML
} > "$OVR"

echo "==> Wrote $OVR; restarting auth..."
sudo docker compose up -d auth

echo "==> Verify (want \"google\":true):"
sleep 4
curl -s https://api.taureye.com/auth/v1/settings | grep -o '"google":[a-z]*' || echo "(could not read settings)"
echo "Now click 'Continue with Google' on https://taureye.com (hard-refresh first)."
