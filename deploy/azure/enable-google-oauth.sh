#!/usr/bin/env bash
# (kept for back-compat) Enable Google sign-in via the generic multi-provider
# script, so turning on Google never clobbers other already-enabled providers.
# Run on the VM:
#   bash deploy/azure/enable-google-oauth.sh "<GOOGLE_CLIENT_ID>" "<GOOGLE_CLIENT_SECRET>"
#
# Prereqs (in the browser first): a Google Cloud OAuth "Web application" client
#   Authorized redirect URI: https://api.taureye.com/auth/v1/callback
#   Authorized JS origin:    https://taureye.com
set -euo pipefail
exec "$(dirname "$0")/enable-oauth.sh" google "${1:?client id}" "${2:?secret}"
