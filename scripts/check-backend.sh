#!/usr/bin/env bash
# TaurEye — backend smoke test for the credit economy.
#
# Run this where Supabase is reachable (your laptop, the VM, or anywhere with
# egress to *.supabase.co). It confirms, from the OUTSIDE, that the pieces the
# credit economy depends on are actually deployed and tells you whether charging
# is live.
#
# Usage:
#   export SUPABASE_URL="https://xxxx.supabase.co"
#   export SUPABASE_ANON_KEY="eyJhbGciOi..."        # public anon key (safe)
#   # Optional — paste a signed-in user's access token to test the authed path
#   # (DevTools → Application → Local Storage → sb-*-auth-token → access_token):
#   export USER_JWT="eyJhbGciOi..."
#   ./scripts/check-backend.sh
#
# Exit code is non-zero if any hard check fails.

set -u

URL="${SUPABASE_URL:-}"
ANON="${SUPABASE_ANON_KEY:-}"
JWT="${USER_JWT:-}"

if [[ -z "$URL" || -z "$ANON" ]]; then
  echo "✖ Set SUPABASE_URL and SUPABASE_ANON_KEY first (see header)." >&2
  exit 2
fi
URL="${URL%/}"
BEARER="${JWT:-$ANON}"
fail=0

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✖\033[0m %s\n" "$1"; fail=1; }
hdr()  { printf "\n\033[1m%s\033[0m\n" "$1"; }

# curl helper → prints "HTTP_CODE<newline>BODY"
call() {
  local method="$1" path="$2" auth="$3" data="${4:-}"
  local args=(-s -m 25 -X "$method" -w $'\n%{http_code}'
    -H "apikey: $ANON" -H "Authorization: Bearer $auth"
    -H "content-type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  curl "${args[@]}" "$URL$path" 2>/dev/null
}
code_of() { tail -n1 <<<"$1"; }
body_of() { sed '$d' <<<"$1"; }

echo "TaurEye backend check → $URL"

# 1) Project / REST reachable -------------------------------------------------
hdr "1. Project reachable"
r=$(call GET "/rest/v1/" "$ANON"); c=$(code_of "$r")
if [[ "$c" =~ ^(200|400|404)$ ]]; then pass "REST API responds (HTTP $c)"
elif [[ -z "$c" ]]; then bad "No response — wrong URL or no network egress to Supabase."
else bad "Unexpected HTTP $c from REST root."; fi

# 2) Schema: credit_products + ledger ----------------------------------------
hdr "2. Schema (credits.sql / schema.sql applied)"
r=$(call GET "/rest/v1/credit_products?select=id,credits,price_inr&active=eq.true&order=sort" "$BEARER")
c=$(code_of "$r"); b=$(body_of "$r")
if [[ "$c" == "200" ]]; then
  n=$(grep -o '"credits"' <<<"$b" | wc -l | tr -d ' ')
  pass "credit_products table present ($n active pack(s))"
  [[ "$n" == "0" ]] && warn "No active packs — fine for Phase B (purchases are Phase C)."
elif grep -qiE "does not exist|could not find|relation" <<<"$b"; then
  bad "credit_products missing — run supabase/schema.sql + credits.sql."
else warn "credit_products read returned HTTP $c (RLS may hide it without a user)."; fi

# 3) RPCs exist ---------------------------------------------------------------
hdr "3. Secure RPCs (spend_credits / claim_daily / my_balance)"
for fn in my_balance spend_credits claim_daily; do
  case "$fn" in
    my_balance)    d='{}' ;;
    spend_credits) d='{"p_reason":"__diag__","p_cost":0}' ;;
    claim_daily)   d='{"p_amount":0}' ;;
  esac
  r=$(call POST "/rest/v1/rpc/$fn" "$BEARER" "$d"); c=$(code_of "$r"); b=$(body_of "$r")
  if grep -qiE "could not find the function|does not exist" <<<"$b"; then
    bad "RPC $fn() not found — credits.sql not applied."
  elif [[ "$c" =~ ^(200|401|403|400)$ ]]; then
    pass "RPC $fn() exists (HTTP $c)"
  else warn "RPC $fn() returned HTTP $c."; fi
done

# 4) Edge Functions deployed + LLM key ---------------------------------------
hdr "4. Edge Functions (ai-analysis / ai-report)"
for fn in ai-analysis ai-report; do
  r=$(call POST "/functions/v1/$fn" "$BEARER" '{"symbol":"RELIANCE"}')
  c=$(code_of "$r"); b=$(body_of "$r")
  if [[ "$c" == "404" ]] && ! grep -qi "configured" <<<"$b"; then
    bad "$fn not deployed — supabase functions deploy $fn"
  elif grep -qi '"configured":false' <<<"$b"; then
    bad "$fn deployed but ANTHROPIC_API_KEY is missing — supabase secrets set ANTHROPIC_API_KEY=..."
  elif grep -qi "not_authenticated" <<<"$b"; then
    pass "$fn deployed + LLM key present (anon got 401 not_authenticated, as expected)"
  elif [[ -n "$JWT" && "$c" == "200" ]]; then
    pass "$fn deployed + returned AI output for your token"
  elif [[ -n "$JWT" && "$c" == "402" ]]; then
    pass "$fn deployed — charging is ON (402 insufficient_credits for your token)"
  else warn "$fn returned HTTP $c: $(head -c 160 <<<"$b")"; fi
done

# 5) Authed path: balance + is charging live? --------------------------------
hdr "5. Charging state (needs USER_JWT)"
if [[ -z "$JWT" ]]; then
  warn "Skipped — set USER_JWT to a signed-in token to test real balance + debit."
else
  r=$(call POST "/rest/v1/rpc/my_balance" "$JWT" '{}'); before=$(body_of "$r" | tr -dc '0-9-')
  if [[ -z "$before" ]]; then
    warn "Couldn't read my_balance for this token (expired? re-copy it)."
  else
    pass "Signed-in balance: $before credits"
    r=$(call POST "/functions/v1/ai-analysis" "$JWT" '{"symbol":"RELIANCE"}'); c=$(code_of "$r")
    r=$(call POST "/rest/v1/rpc/my_balance" "$JWT" '{}'); after=$(body_of "$r" | tr -dc '0-9-')
    if [[ "$c" == "402" ]]; then
      pass "CHARGE_CREDITS=true — server refused (insufficient). Charging is LIVE."
    elif [[ -n "$after" && "$after" -lt "$before" ]]; then
      pass "CHARGE_CREDITS=true — balance $before → $after. Charging is LIVE. 💸"
    elif [[ -n "$after" && "$after" == "$before" ]]; then
      warn "Balance unchanged ($before) after an AI call — CHARGE_CREDITS is OFF (preview). Flip with: supabase secrets set CHARGE_CREDITS=true"
    else warn "AI call HTTP $c; balance now '$after'."; fi
  fi
fi

hdr "Result"
if [[ "$fail" == "0" ]]; then
  echo "  All hard checks passed. Backend is wired for the credit economy."
else
  echo "  Some checks failed — see ✖ above (and ECONOMY.md → Activation phases)."
fi
exit "$fail"
