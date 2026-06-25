#!/usr/bin/env bash
# TaurEye — READ-ONLY security audit for the self-hosted Azure VM.
#   bash deploy/azure/secaudit.sh
# Makes NO changes. Prints [PASS]/[WARN]/[FAIL]/[INFO]. Run as a sudo-capable user.
set -uo pipefail
cd "$(dirname "$0")"

g(){ printf '\033[1;32m[PASS]\033[0m %s\n' "$*"; }
w(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
f(){ printf '\033[1;31m[FAIL]\033[0m %s\n' "$*"; }
i(){ printf '\033[1;36m[INFO]\033[0m %s\n' "$*"; }
hdr(){ printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

SENV="supabase-docker/.env"

hdr "1. Supabase secrets (default/demo detection — CRITICAL)"
if [ -f "$SENV" ]; then
  grep -q 'your-super-secret-jwt-token' "$SENV" && f "JWT_SECRET is the DEMO value — anyone can forge service_role JWTs and bypass RLS. ROTATE NOW." || g "JWT_SECRET is not the demo value"
  grep -q 'your-super-secret-and-long-postgres-password' "$SENV" && f "POSTGRES_PASSWORD is the DEMO value — change it." || g "POSTGRES_PASSWORD changed from demo"
  grep -q 'this_password_is_insecure_and_should_be_updated' "$SENV" && f "DASHBOARD_PASSWORD is the DEMO value — Studio is wide open." || g "DASHBOARD_PASSWORD changed from demo"
  # known demo anon/service JWTs start with this exact payload segment
  grep -qE 'eyJ.*cm9sZSI6ImFub24iLCJpc3MiOiJzdXBhYmFzZS1kZW1v' "$SENV" && f "ANON/SERVICE keys are the published DEMO JWTs — regenerate from your JWT_SECRET." || g "API keys are not the published demo JWTs"
  perm=$(stat -c '%a' "$SENV" 2>/dev/null); [ "$perm" = "600" ] || w "$SENV perms are $perm (want 600)"
else
  i "no $SENV here (run from deploy/azure, or this VM doesn't host Supabase)"
fi

hdr "2. Publicly-bound listening ports (0.0.0.0 / ::)"
if command -v ss >/dev/null; then
  sudo ss -tlnp 2>/dev/null | awk 'NR==1 || /0\.0\.0\.0|\[::\]|\*:/' | sed 's/^/  /'
  for p in 5432 6543 8000 8443 3000 8001; do
    sudo ss -tlnp 2>/dev/null | grep -qE "0\.0\.0\.0:$p|\[::\]:$p|\*:$p" \
      && w "port $p is bound to ALL interfaces — should it be public? (Postgres 5432/6543, Kong 8000 ideally localhost-only behind nginx)"
  done
else i "ss not available"; fi

hdr "3. Postgres / Kong exposure"
sudo docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -iE 'db|kong|pooler|supavisor' | sed 's/^/  /'
sudo docker ps --format '{{.Ports}}' 2>/dev/null | grep -qE '0\.0\.0\.0:5432|0\.0\.0\.0:6543' \
  && f "Postgres is published to 0.0.0.0 — direct DB access from the internet. Bind to 127.0.0.1 or close in NSG." || g "Postgres not published to 0.0.0.0"
sudo docker ps --format '{{.Ports}}' 2>/dev/null | grep -qE '0\.0\.0\.0:8000' \
  && w "Kong :8000 is public. OK only if you rely on it directly; prefer 127.0.0.1:8000 behind nginx + close 8000 in NSG." || g "Kong not directly public on 0.0.0.0:8000"

hdr "4. Supabase auth posture"
S=$(curl -s --max-time 8 https://api.taureye.com/auth/v1/settings 2>/dev/null)
if [ -n "$S" ]; then
  echo "$S" | grep -q '"autoconfirm":true' && w "email autoconfirm is ON — anyone can sign up with any email unverified. Turn off once SMTP is set." || g "email autoconfirm is off"
  echo "$S" | grep -q '"disable_signup":true' && i "signup disabled" || i "signup enabled (expected for a public product)"
else i "couldn't read api.taureye.com/auth/v1/settings"; fi

hdr "5. SSH hardening"
SC=/etc/ssh/sshd_config
sudo grep -qiE '^[[:space:]]*PasswordAuthentication[[:space:]]+no' $SC 2>/dev/null && g "password auth disabled" || w "PasswordAuthentication not set to 'no' — brute-force surface. Set it and reload sshd."
sudo grep -qiE '^[[:space:]]*PermitRootLogin[[:space:]]+(no|prohibit-password)' $SC 2>/dev/null && g "root login restricted" || w "PermitRootLogin not restricted"

hdr "6. Firewall / fail2ban"
if command -v ufw >/dev/null && sudo ufw status 2>/dev/null | grep -qi active; then g "ufw active"; else w "ufw not active (you may be relying solely on the Azure NSG — verify NSG allows ONLY 22/80/443)"; fi
command -v fail2ban-client >/dev/null && g "fail2ban installed" || w "fail2ban not installed — consider it for SSH brute-force protection"

hdr "7. TLS + HTTP security headers"
H=$(curl -sI --max-time 8 https://taureye.com 2>/dev/null)
echo "$H" | grep -qi '^strict-transport-security' && g "HSTS present" || w "no HSTS header — add 'Strict-Transport-Security' in nginx"
echo "$H" | grep -qi '^x-content-type-options' && g "X-Content-Type-Options present" || w "missing X-Content-Type-Options: nosniff"
echo "$H" | grep -qi '^x-frame-options\|^content-security-policy' && g "framing/CSP header present" || w "no X-Frame-Options / CSP — clickjacking surface"
echo "$H" | grep -qi '^server: nginx/[0-9]' && w "nginx version leaked in Server header — set 'server_tokens off;'" || i "Server header not leaking a version (or hidden)"
command -v certbot >/dev/null && { sudo certbot certificates 2>/dev/null | grep -iE 'Domains|Expiry' | sed 's/^/  /'; }

hdr "8. Docker hardening"
sudo docker ps --format '{{.Names}}' 2>/dev/null | while read -r c; do
  u=$(sudo docker inspect -f '{{.Config.User}}' "$c" 2>/dev/null)
  [ -z "$u" ] && w "container '$c' runs as root (no USER set)"
done
sudo docker ps --format '{{.Names}}\t{{.Mounts}}' 2>/dev/null | grep -q docker.sock \
  && w "a container mounts docker.sock (ofelia scheduler) — container escape risk if compromised; it's mounted :ro which helps"

hdr "9. OS patch level"
if command -v dnf >/dev/null; then n=$(sudo dnf -q updates 2>/dev/null | grep -c .); else n=$(apt list --upgradable 2>/dev/null | grep -c upgradable); fi
[ "${n:-0}" -gt 1 ] && w "$n package updates pending — run system updates" || g "OS appears up to date"

printf '\n\033[1mAudit complete. Address FAIL first, then WARN.\033[0m\n'
