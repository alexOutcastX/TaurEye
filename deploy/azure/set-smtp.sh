#!/usr/bin/env bash
# Turn ON transactional email (signup verification + password reset) on the
# self-hosted Supabase: wire an SMTP provider and REQUIRE email confirmation.
#
#   bash deploy/azure/set-smtp.sh <HOST> <PORT> <USER> <PASS> <SENDER_EMAIL> [SENDER_NAME]
# e.g. (Brevo):
#   bash deploy/azure/set-smtp.sh smtp-relay.brevo.com 587 "you@login" "smtp-key" noreply@taureye.com TaurEye
set -euo pipefail
H="${1:?usage: set-smtp.sh <HOST> <PORT> <USER> <PASS> <SENDER_EMAIL> [SENDER_NAME]}"
PORT="${2:?port}"; U="${3:?user}"; P="${4:?pass}"; FROM="${5:?sender email}"; NAME="${6:-TaurEye}"
cd "$(dirname "$0")/supabase-docker"
ENV=.env

set_env() {  # set_env <key> <value>
  python3 - "$ENV" "$1" "$2" <<'PY'
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

echo "==> Writing SMTP settings to supabase-docker/.env ..."
set_env SMTP_HOST "$H"
set_env SMTP_PORT "$PORT"
set_env SMTP_USER "$U"
set_env SMTP_PASS "$P"
set_env SMTP_SENDER_NAME "$NAME"
set_env SMTP_ADMIN_EMAIL "$FROM"

echo "==> Requiring email confirmation on signup (autoconfirm OFF) ..."
set_env ENABLE_EMAIL_AUTOCONFIRM "false"

echo "==> Ensuring email links use the public domain ..."
set_env SITE_URL "https://taureye.com"
set_env API_EXTERNAL_URL "https://api.taureye.com"
# Newer GoTrue rejects external hosts not on this allow-list (seen in the logs).
set_env GOTRUE_MAILER_EXTERNAL_HOSTS "api.taureye.com,taureye.com"

echo "==> Restarting auth ..."
sudo docker compose up -d auth

cat <<DONE

Done. From now on:
  - New signups receive a verification email and must confirm before logging in.
  - "Forgot password" sends a reset link.
Test: sign up a fresh email on https://taureye.com and check the inbox (+ spam).
To switch providers later, re-run this with new values. To go back to no-email,
set ENABLE_EMAIL_AUTOCONFIRM=true and restart auth.
DONE
