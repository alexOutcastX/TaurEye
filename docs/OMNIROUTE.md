# OmniRoute — AI gateway for the AI features

The AI features (stock **analysis** and **report**) run in two Supabase Edge
Functions: `ai-analysis` and `ai-report`. They can now route through
[OmniRoute](https://github.com/diegosouzapw/OmniRoute) — a self-hosted,
OpenAI-compatible gateway that fans out across many providers (90+ with free
tiers) with automatic fallback — instead of calling Anthropic directly.

## How the routing works (server-side, no client change)

`supabase/functions/_shared/llm.ts` picks the backend from env, in order:

1. **`OMNIROUTE_URL` set** → POST to `<url>/chat/completions` (OpenAI schema),
   `model` = `OMNIROUTE_MODEL` (default `auto` → OmniRoute chooses + falls back).
2. else **`ANTHROPIC_API_KEY` set** → call Anthropic directly (legacy path).
3. else → `configured: false` (the app shows the "AI not configured" message).

The Edge Functions keep the same JWT check, atomic credit spend, refund-on-
failure and audit logging, and return the same `{ configured, text, disclaimer,
error }` shape — so **nothing in the web/app client changes.**

## 1. Start OmniRoute on the VM

It's an opt-in compose profile so it doesn't run unless you ask for it:

```bash
cd ~/TaurEye-main/deploy/azure
sudo docker compose --profile ai up -d omniroute
```

This publishes the dashboard/API on the host loopback (`127.0.0.1:20128`) and
persists config in `deploy/azure/data/omniroute`.

## 2. Configure providers (OmniRoute dashboard)

Open the dashboard through an SSH tunnel from your PC:

```bash
ssh -L 20128:localhost:20128 <you>@<vm>
# then browse http://localhost:20128
```

In the dashboard: add provider accounts/keys (or enable the key-less free
providers like Pollinations), and pick a routing combo. For the metered feature,
prefer a **cheap-first** combo so cost stays near the current ~₹0.5/call. If you
turn on `REQUIRE_API_KEY`, generate an API key here and note it.

## 3. Let the Edge functions reach OmniRoute

The functions run inside the **Supabase** stack's Docker network; OmniRoute runs
in the **TaurEye app** stack. Connect the OmniRoute container to the Supabase
network so the edge-runtime can reach it by name:

```bash
# find the Supabase network name (usually 'supabase_default')
sudo docker network ls | grep supabase
# attach OmniRoute to it
sudo docker network connect supabase_default taureye-omniroute
```

Now the edge-runtime can reach `http://taureye-omniroute:20128/v1`.

## 4. Point the Edge functions at OmniRoute + deploy

```bash
cd ~/TaurEye-main
supabase secrets set OMNIROUTE_URL=http://taureye-omniroute:20128/v1
supabase secrets set OMNIROUTE_MODEL=auto            # or auto/cheap, cc/claude-haiku-4-5, ...
supabase secrets set OMNIROUTE_API_KEY=<key>         # only if REQUIRE_API_KEY=true; else skip

supabase functions deploy ai-analysis
supabase functions deploy ai-report
```

(If you self-host without the `supabase` CLI, set the same env on the
`supabase-edge-functions` container and restart it, and paste the function code
in Studio → Edge Functions.)

## 5. Turn the live AI path on

The client only calls the functions in **live** AI mode. Set the repo Variable
and rebuild web:

```
# GitHub → Settings → Secrets and variables → Actions → Variables
AI_MODE = live
```
```bash
cd ~/TaurEye-main/deploy/azure && sudo docker compose up -d --build web
```

## Verify

```bash
# health: settings should report the function reachable; call it signed in.
curl -s https://api.taureye.com/functions/v1/ai-analysis \
  -H "Authorization: Bearer <a signed-in user's JWT>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"symbol":"RELIANCE","facts":{"close":1400,"rsi_14":55}}'
# → {"configured":true,"text":"…","disclaimer":"…"}
```
Then open a stock's Chart page in the app and generate the AI analysis/report —
the function logs will show `provider=omniroute`.

## Rolling back

Unset the OmniRoute secret and the functions fall back to Anthropic instantly:

```bash
supabase secrets unset OMNIROUTE_URL
```

## Notes

- **Credit economics:** the per-call cost is whatever provider OmniRoute lands
  on. Keep a cheap-first combo; the credit charge (10 for analysis, 5 for
  report) is only debited when `CHARGE_CREDITS=true`.
- **SEBI safety unchanged:** the strict factual/non-advisory system prompts and
  the disclaimer live in the Edge Functions, independent of the model used.
- **Keys never touch the browser** — OmniRoute and all provider keys stay on the
  VM behind the edge functions.
