# TaurEye Edge Functions

Production is **static** (nginx serves the SPA + JSON bundle). Anything that needs
a secret or a trusted write — the AI feature, payment grants, rewarded-ad grants —
runs here as a Supabase Edge Function (Deno), not in the browser.

| Function | Purpose | JWT | Secrets |
|---|---|---|---|
| `ai-analysis` | Verifies user → spends 10 credits → calls Claude (Haiku) → factual, SEBI-safe summary. Refunds on failure. | required | `ANTHROPIC_API_KEY` |
| `razorpay-webhook` | On `payment.captured`, verifies HMAC → grants pack credits (idempotent on payment id). | none (`--no-verify-jwt`) | `RAZORPAY_WEBHOOK_SECRET` |
| `admob-ssv` | Rewarded-ad Server-Side Verification → grants credits (dedupe on `transaction_id`). | none (`--no-verify-jwt`) | `ADMOB_SSV_ENFORCE` |

## One-time deploy

```sh
# 1. Link the project (run once)
supabase link --project-ref <your-project-ref>

# 2. Apply the SQL (or paste schema.sql then credits.sql in the SQL editor)
supabase db push   # if using migrations, or run the .sql files manually

# 3. Set the server-only secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set RAZORPAY_WEBHOOK_SECRET=...

# 4. Deploy
supabase functions deploy ai-analysis
supabase functions deploy razorpay-webhook --no-verify-jwt
supabase functions deploy admob-ssv --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not set them yourself.

## Before going live

- **`admob-ssv`**: implement the signature check (`verifyAdMobSignature`, marked
  TODO) and set `ADMOB_SSV_ENFORCE=true`. Until then it accepts unsigned calls in
  dev — keep the economy OFF so no real credits are mintable.
- **`razorpay-webhook`**: create payments with `notes: { user_id, product_id }`
  so the grant knows whom/what to credit. Register the function URL as the webhook
  endpoint in the Razorpay dashboard and subscribe to `payment.captured`.
- **`ai-analysis`**: the client calls it via `supabase.functions.invoke('ai-analysis')`
  (already wired in `src/api/client.ts`). The model is `claude-haiku-4-5` — keep
  the metered path on Haiku/Sonnet, never Opus.
