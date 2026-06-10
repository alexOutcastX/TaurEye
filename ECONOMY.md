# TaurEye — Credit economy & monetization spec

The product strategy is **free tier + ads + broker affiliate**, with **credits**
metering premium (mainly AI) actions and a future **Pro** subscription on top.
This doc captures the agreed numbers and how the pieces fit. Code is staged but
the economy stays **OFF** (`ECONOMY_ENABLED = false`) until you activate it.

## Where credits fit
- **Free users** earn a trickle (daily + rewarded ads) and can buy packs.
- **Pro** (later) gets a monthly credit grant / fair-use, plus no ads.
- Credits are **closed-loop** — in-app only, never cashable — to stay clear of
  RBI prepaid-instrument rules. 18% GST applies to credit sales.

## Numbers (single source of truth)
Keep these three in sync: `src/lib/economy.ts` (COSTS/REWARDS), `supabase/credits.sql`
(signup/daily/spend), and the Edge Functions (`AI_COST`, `REWARD`).

**Sinks (COSTS)** — most run client-side (≈₹0 COGS); only AI has real cost.

| Action | Credits | Note |
|---|---|---|
| AI analysis | 10 | Haiku ≈ ₹0.45/call → ~95% margin; charged **server-side** by `ai-analysis` |
| Advanced report | 5 | ≈₹0 COGS |
| Pattern deep-scan | 3 | ≈₹0 COGS |
| NL screener | 0 (free) | Acquisition wow — never gate it |
| Remove ads (pack) | 100 | Ad-removal as a sink |

**Faucets (REWARDS)** — deliberately modest so purchasing has a reason.

| Source | Credits | Guard |
|---|---|---|
| Signup bonus | 50 | once per verified account (signup trigger) |
| Daily claim | 5/day | server-enforced once per UTC day |
| Rewarded ad | 5 | AdMob SSV, deduped on transaction id |
| Referral (you / friend) | 50 / 30 | anti-self-referral |

**Packs** (`credit_products`): ₹99→100, ₹299→350, ₹599→750 (volume discount).
**Credit value** ≈ ₹1, discounted in bulk. AI sink must stay above token cost.

## Architecture
- **Balance is server-side** (`credit_transactions` ledger + `current_balance`),
  never trust localStorage once credits are purchasable.
- **Client write path** is only `spend_credits()` and `claim_daily()` (SECURITY
  DEFINER RPCs that self-enforce). Reads via `my_balance()` / the ledger.
- **Grants that are forgeable** (rewarded ad, purchase) are written **only** by
  Edge Functions using the service role after verifying a signature.
- AI runs in the `ai-analysis` Edge Function (LLM key server-side; refunds on
  failure).

## Files
| File | Role |
|---|---|
| `src/lib/economy.ts` | Local/guest engine + the agreed COSTS/REWARDS; `ECONOMY_ENABLED` flag |
| `src/lib/credits.ts` | Server adapter (`myBalance`/`spendCredits`/`claimDaily`/`listProducts`) — the activation layer |
| `supabase/schema.sql` | Phase-1 tables (profiles, ledger, purchases, …) + RLS |
| `supabase/credits.sql` | Products + secure RPCs + signup bonus (run after schema.sql) |
| `supabase/functions/*` | AI / Razorpay / AdMob serverless endpoints |

## Activation phases
- **Phase A — infra dark:** run `schema.sql` + `credits.sql`, deploy functions,
  set secrets. No user-visible change; `ECONOMY_ENABLED` stays false.
- **Phase B — faucets + AI sink:** swap Wallet/Chart to `credits.ts`
  (`myBalance`/`claimDaily`, and let `ai-analysis` charge AI). Flip
  `ECONOMY_ENABLED = true`. Gather burn-rate data with **no purchases yet**.
- **Phase C — purchases:** wire Razorpay checkout on the packs → webhook grants.
  Add GST invoicing.
- **Phase D — Pro:** monthly credit grant for subscribers; ad-removal sink.

When activating, charge the AI sink **once** (server-side) — remove the
client-side `spend("ai_analysis", …)` in `Chart.tsx` so it isn't double-billed.

## Guardrails
- AI output stays factual + carries the disclaimer (SEBI — no advice).
- Never commit secrets; the LLM/Razorpay keys live only in Edge Function secrets.
- Keep production static — these are external services (Supabase/Anthropic), not
  a revived `/api`.
