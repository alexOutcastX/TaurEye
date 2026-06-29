# Running two versions of TaurEye during the self-hosting transition

During the move off Cloud Supabase + Anthropic, TaurEye runs as **two builds of
one codebase** — not two branches. Every feature/fix lands once on `main` and
both versions inherit it. The only thing that differs is **build-time config**
(env vars / CI variables), so there is no branch drift to maintain.

| | **Version A — Self-host (target)** | **Version B — Legacy (current prod)** |
|---|---|---|
| Auth + wallet DB | **Self-hosted Supabase** (Docker, later your cloud) | **Cloud Supabase** project |
| AI analysis + reports | **Nightly cache only** — ₹0, no Edge Functions, no Anthropic | Nightly cache **+ Anthropic Edge Function fallback** |
| `VITE_AI_MODE` | `cache` (default) | `live` |
| `VITE_SUPABASE_URL` / `_ANON_KEY` | self-host Kong URL + its anon key | Cloud project URL + anon key |
| Data bundle (`/data`) | same Oracle VM bundle | same Oracle VM bundle |
| Credit economy | client-side `spend()` (same in both) | client-side `spend()` (Edge Fn server-charge stays **off**) |

## The one code switch: `VITE_AI_MODE`

Defined in `src/data/source.ts` (`AI_MODE` / `AI_LIVE`). Read by `src/api/client.ts`
and `src/lib/reportData.ts`:

- **`cache`** (default — anything that isn't the literal `live`): AI is served
  only from `reports/<SYMBOL>.json`. No `supabase.functions.invoke` is ever
  called, so the cost-zero build cannot make an Anthropic request.
- **`live`**: cache first; if a symbol has no cached file, fall back to the
  `ai-analysis` / `ai-report` Edge Functions (which use `ANTHROPIC_API_KEY`
  server-side). This reproduces the pre-self-hosting behaviour.

Fail-safe: an unset/unknown value resolves to `cache`, so a misconfigured build
defaults to **₹0**, never to paid.

## The two deploy configs

Both pipelines (`.github/workflows/deploy.yml`, `mobile-ota.yml`) read
`VITE_AI_MODE` from the repo variable **`AI_MODE`** and the Supabase target from
the secrets **`VITE_SUPABASE_URL`** / **`VITE_SUPABASE_ANON_KEY`**. Switching a
deployment between the two versions is a settings change, not a code change.

### Version B — Legacy (Cloud + Anthropic), the existing VM deploy
GitHub → repo **Settings → Secrets and variables → Actions**:
- Variable `AI_MODE = live`
- Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` = your **Cloud** project
- Edge Functions deployed with `ANTHROPIC_API_KEY` set (`supabase secrets set …`)

Push to `main` → builds with the Anthropic fallback → ships to the Oracle VM.

### Version A — Self-host (cache, ₹0)
Run it from your machine (or, later, your own cloud) against the self-hosted
Supabase from `docs/SELF-HOST-SUPABASE.md`. Local `.env.local`:

```
VITE_DATA_SOURCE=local
VITE_AI_MODE=cache
VITE_SUPABASE_URL=https://api.taureye.com      # your self-host Supabase (via nginx TLS)
VITE_SUPABASE_ANON_KEY=eyJ...self-host anon...
VITE_DATA_BASE=https://taureye.com/data        # reuse the live bundle
VITE_CANDLE_BASE=https://taureye.com/data
```

`npm run dev` (or `npm run build`) → cache-only AI, self-host auth/wallet.
When your cloud host is ready, point a second CI deploy at it with
`AI_MODE=cache` and the self-host Supabase URL/anon key — same workflow shape as
Version B.

## Cutover (end of transition)

When Version A is proven, retire Version B: set the VM deploy's `AI_MODE=cache`,
repoint `VITE_SUPABASE_*` to the (now cloud-hosted) self-host project, and the
`ai-analysis` / `ai-report` Edge Functions + `ANTHROPIC_API_KEY` can be deleted.
No code change — just config — because both versions were always one codebase.
