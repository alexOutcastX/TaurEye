# Monetization setup — your side

Everything in the repo is staged. This is the checklist of things only you can do
(accounts, keys, store listings). Work top-down; each phase earns before the next.

## Phase 1 — earns immediately, no payment infra
- [ ] **Broker affiliate** (highest margin, zero infra). Sign up for partner
      programs (Zerodha / Angel One / Upstox / Dhan), get your referral links, and
      tell me — I'll add tasteful "Open a demat" CTAs to stock pages (factual +
      disclaimer, SEBI-safe).
- [ ] **AdSense (web)**: create an account, get the publisher ID. **AdMob (app)**:
      create an app + banner/interstitial/rewarded ad units. Send me the IDs and
      I'll wire the existing `AdSlot`s + rewarded flow. *(AdMob is a native change
      → needs one APK rebuild.)*
- [ ] **Privacy policy** URL (AdMob/DPDP require it) + consent (UMP) — needed
      before ads serve.

## Phase 2 — cloud wallet + credits
- [ ] **Create a Supabase project.** Copy `Project URL` + `anon key` into
      `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (and the GitHub/CI
      secrets used by the build workflows).
- [ ] **Run the SQL**: in the Supabase SQL editor, run `supabase/schema.sql` then
      `supabase/credits.sql`.
- [ ] **Deploy Edge Functions** (see `supabase/functions/README.md`):
      `ai-analysis`, `razorpay-webhook --no-verify-jwt`, `admob-ssv --no-verify-jwt`.
- [ ] **Set secrets**: `ANTHROPIC_API_KEY` (for AI), `RAZORPAY_WEBHOOK_SECRET`.
      Get an Anthropic API key at console — the metered model is Haiku (cheap).
- [ ] **Razorpay account** (KYC): create payment flow with
      `notes: { user_id, product_id }`; register the webhook URL → `payment.captured`.
- [ ] **GST registration** (18% on credit sales) + invoicing.
- [ ] Tell me when the project exists and I'll do Phase B wiring (swap Wallet/Chart
      to the server wallet and flip `ECONOMY_ENABLED`).

## Phase 3 — Pro subscription (later)
- [ ] Decide pricing (₹999/yr suggested, undercutting the ₹5k incumbents).
- [ ] Razorpay subscription plan (or Play Billing if store-published).

## Notes
- **What I've already staged:** the secure SQL wallet (`credits.sql`), the three
  Edge Functions, the client adapter (`credits.ts`), the agreed credit numbers in
  `economy.ts`, the AI call wired through Supabase, and `.env.example`.
- **Nothing is live** until you add accounts/keys and I flip `ECONOMY_ENABLED`.
- See `ECONOMY.md` for the full spec and the phase plan.
