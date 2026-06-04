# TaurEye — Product Specification

**Status:** Draft v2
**Owner:** Alex Murur
**Scope:** Turn the TaurEye screener (currently a local React + FastAPI tool) into a
published multi-platform product with user accounts, a credit economy, AI
analysis, and push notifications.

---

## 1. Overview

TaurEye is an NSE/BSE equity screener and charting app for Indian markets. The
current build is a single-user local tool (React/Capacitor frontend + FastAPI
backend + SQLite EOD spine). This spec defines the evolution into a commercial
product distributed on **Web, Android, and iOS** with accounts, monetization,
and AI features.

### Goals
- One codebase shipping to Web + Android + iOS.
- User accounts with cloud-synced watchlists, screens, and reports.
- A credit system (purchase + refer-and-earn) gating premium features such as
  AI analysis.
- Push notifications.
- Daily-refreshed market data, decoupled from user data.
- Regulatory-safe AI/analysis content (India / SEBI).

### Non-Goals (initially)
- Real-time/intraday tick data (product is EOD-based).
- Investment advisory / buy-sell recommendations (regulated — see §7).
- Trade execution / brokerage.

---

## 2. Platforms & Distribution

| Platform | Build | Distribution |
|---|---|---|
| Web | Vite build of the React app | Static host (Cloudflare Pages / Netlify) |
| Android | Capacitor → APK/AAB | Google Play |
| iOS | Capacitor → Xcode → IPA | Apple App Store |

Single React + Capacitor codebase across all three (already in place for
Android/Web; iOS requires a Mac/Xcode for the build + Apple Developer account).

---

## 3. System Architecture

Two independent systems: **shared market data** (public) and **user data**
(private, per-account).

```
        Clients: Web / Android / iOS  (React + Capacitor)
                          │
                          ▼
                      App API
       ┌──────────────┼───────────────┬───────────────┐
       ▼              ▼                ▼               ▼
  Auth provider   App DB (Postgres)  Payments        AI service
  (passwords)     users, watchlists, (web: Razorpay   (LLM API,
                  screens, reports,   /Stripe;         credit-gated,
                  credits, txns       apps: IAP)       educational)
                          │
                          ▼
                  Push (FCM / APNs)

   Market-data service (separate, scheduled):
     nightly scrape (NSE/BSE bhavcopy) → reconcile → adjust →
     compute indicators → publish screener snapshot (JSON) + per-symbol candles
```

### 3.1 Market-data service
- Reuses the existing Python data engine (master, corporate actions, EOD
  reconcile, split/bonus adjustment, market-cap enrichment, indicators).
- Runs **once daily** (after market close) on a small VM or scheduled job.
- **Outputs**, not a live DB to clients:
  - `screener-data.json` — one row per security (all screener metrics). ~1–2 MB.
  - `candles/<SYMBOL>.json` — per-symbol daily OHLCV history for charts (~20–40 KB
    each), fetched on demand.
- Working history needed to compute the snapshot is ~1.25–1.5 years (~200 MB);
  full multi-year history only needed if longer native charts are kept.

### 3.2 Client data model (on device)
- Screener runs **on-device** against the cached `screener-data.json` (works
  offline once cached; refreshes from the published file when online).
- Charts use the **native chart** rendered from our own per-symbol candle files
  (our exchange-sourced data). **TradingView's data is not used** to power our
  chart (no free data API; extracting their feed violates their ToS). Their
  embeddable widget may remain as an optional online view only.

---

## 4. Data Model (App DB — Postgres)

| Entity | Key fields |
|---|---|
| `users` | id, email, display_name, created_at, referral_code, referred_by, status |
| `auth` | handled by the auth provider (hashed passwords, OAuth, MFA) — not stored by us in plaintext |
| `watchlists` | id, user_id, name, items (symbols), updated_at |
| `screens` | id, user_id, name, request_json, created_at |
| `reports` | id, user_id, symbol, payload, created_at |
| `credits_balance` | user_id, balance |
| `credit_transactions` | id, user_id, delta, reason (purchase/referral/spend/refund), ref_id, created_at |
| `purchases` | id, user_id, provider, provider_txn_id, amount, currency, credits, status, created_at |
| `referrals` | id, referrer_id, referee_id, reward_credits, status, created_at |
| `devices` | id, user_id, push_token, platform |
| `ai_jobs` | id, user_id, symbol, prompt_type, status, cost_credits, created_at |

- `credit_transactions` is an **append-only ledger**; `credits_balance` is the
  derived sum (single source of truth = the ledger).
- Row-Level Security so each user can only read/write their own rows.

---

## 5. Features

### 5.1 Accounts & sync
- Sign up / sign in (email + password, plus optional Google/Apple OAuth).
- Email verification, password reset, optional MFA — via the auth provider.
- Watchlists, saved screens, and reports sync to the cloud per account.
- Guest/anonymous mode may persist locally and merge on sign-up.

### 5.2 Screener & charts
- On-device screener over the cached snapshot (filters, sorting, segments).
- Stock detail page: factual Key-data panel + native chart (our data).
- Free for all signed-in users.

### 5.3 Credits
- Credits unlock premium features (e.g., AI analysis, advanced reports).
- **Earned (faucets):**
  - **Daily free claim:** +1 credit/day (once per day).
  - **Rewarded ad:** +5 credits, **max one ad per day**.
  - **Refer-and-earn:** reward amount TBD.
  - **Purchase:** credit packs (web: Razorpay/Stripe; apps: IAP).
- **Spent (sinks):** AI analysis, NL screen builder, pattern scanner, advanced
  reports/alerts, and the **no-ad pack (100 credits)** — costs TBD per feature.
- Every change recorded in the append-only `credit_transactions` ledger; the
  balance is the derived sum and is never edited directly.
- Anti-abuse: daily claim + rewarded ad are server-validated and rate-limited
  per account/device (not client-trusted).

### 5.4 Refer-and-earn
- Each user gets a `referral_code`.
- Referrer + referee earn credits when the referee signs up / completes a
  qualifying action (define: first purchase vs. signup — anti-abuse).
- Anti-abuse: device/email checks, reward on verified action, caps.
- **App-store caveat:** free credits that unlock paid digital features must be
  designed within Apple/Google policies (see §6).

### 5.5 AI analysis (credit-gated)
- Server-side LLM call summarizing a stock's *factual* indicators / price action
  in plain language.
- **Educational only** — no buy/sell calls, no target prices, no recommendations.
- Carries the not-advice / not-SEBI-registered disclaimer (see §7).
- Each run debits credits; logged in `ai_jobs` + `credit_transactions`.

### 5.6 Push notifications
- FCM (Android + Web) bridging to APNs (iOS), via Capacitor Push plugin.
- Use cases: price/indicator alerts on watchlist names, credit/referral events,
  product updates. Per-user device tokens in `devices`; user opt-in required.

### 5.7 Chart pattern recognition
- Detects technical chart patterns from a stock's price history and surfaces them.
- **Two modes:**
  - **Per-chart annotation** — highlights detected patterns (with pivot points /
    necklines / trendlines) on the open stock's chart.
  - **Scanner** — finds all stocks currently forming/completing a chosen pattern;
    integrates with the screener as a filter ("show stocks forming an ascending
    triangle").
- **Pattern set (proposed v1):**
  - Classical: head & shoulders (and inverse), double/triple top & bottom,
    ascending/descending/symmetrical triangles, flags & pennants, wedges,
    channels, cup & handle, rounding top/bottom.
  - Candlestick: engulfing, doji, hammer/shooting-star, harami, etc.
  - Structural: support/resistance levels, trendlines, breakouts.
- **Detection approach (TBD):** rule-based geometry on the OHLC series
  (deterministic, explainable, cheap) and/or ML pattern detection. Likely
  rule-based for v1, ML later.
- **Output is descriptive only** — labels the pattern and its key points
  factually (e.g. "double top formed at ₹X / ₹Y, neckline ₹Z"). **No
  predictions, targets, or buy/sell framing** (SEBI — see §7).
- **Where it runs:** scanner runs server-side over candle data (compute-heavy);
  per-chart annotation can run client-side on the fetched candle file.
- **Monetization:** likely **credit-gated / premium** (especially the scanner).
- **Integrations:** feeds **alerts** (notify when a pattern forms on a watchlist
  name) and **AI analysis** (AI explains a detected pattern in plain language).

### 5.8 Natural-language screen builder ("describe a screen")
- User types a plain-English strategy (e.g. "golden crossover", "20dma crossing
  50", "RSI below 30 and price above 200 DMA") and the app **fills the screen
  builder** with the matching filter settings, ready to run/edit.
- **Approach:** an LLM with **structured output** translates the text into the
  screener's filter schema — *not* a custom-trained model. The LLM is
  **constrained to a defined condition catalog** (below); it cannot invent
  unsupported filters, and if a request can't be expressed it says so.
- **Output is shown and editable** in the screen builder before running, so the
  user sees exactly what was understood.
- **Credit-gated** (LLM call). SEBI-safe: it converts the user's own words into
  filters — descriptive, not advice.
- **Dependency — Condition Catalog (new screener capability):** the engine's
  current fields are point-in-time only. NL queries need richer, time-series
  conditions that must be computed nightly into the snapshot:
  - Crossovers: `sma_cross(fast, slow, up/down)`, `golden_cross` (50×200 up),
    `death_cross`, `macd_signal_cross`.
  - Relations: `price_above/below_sma(n)`, `rsi between a..b`, `% from 52w
    high/low` (existing).
  - Events: `new_52w_high/low`, `breakout`, `volume_spike(x × avg)`, `gap_up/down`.
  - Pattern flags: `pattern = <name>` (shared with §5.7 pattern recognition).
  This catalog is the single shared vocabulary used by the NL builder, the
  pattern scanner (§5.7), and alerts (§5.6).

### 5.9 Advertising & no-ad pack
- **Mobile (Android/iOS) — rewarded ads:** opt-in rewarded video (Google AdMob
  via a Capacitor plugin). The user watches one ad to **earn +5 credits**,
  **max one ad/day**. Opt-in, so it always stays available as a credit faucet
  (the no-ad pack does not remove it).
- **Display ads (web + mobile):** banner/display units (e.g. Google AdSense on
  web, AdMob banner/interstitial on mobile) shown to non-paying users.
- **No-ad pack:** spend **100 credits** for a **one-time permanent** removal of
  **display ads on both web and mobile** (account entitlement `ads_disabled`).
  Rewarded opt-in ads remain (they earn credits).
- **Economy fit:** rewarded ads are a credit **faucet**; the no-ad pack is a
  credit **sink**; both must be balanced against purchases and refer-and-earn so
  the credit economy stays sound.
- **Compliance:** ad SDKs need a **consent/privacy flow** (DPDP/GDPR) and
  disclosure in the privacy policy; rewarded-ad credits must follow Apple/Google
  policies; ad placements must not obscure the SEBI disclaimer or factual data.

---

## 6. Payments & App-Store Billing (critical constraint)

- **Web:** Razorpay (India) / Stripe for credit purchases.
- **iOS/Android apps:** Apple and Google **require their In-App Purchase**
  (StoreKit / Play Billing) for digital goods like credits/feature unlocks —
  third-party processors (Razorpay/Stripe) are generally **not allowed** in-app
  for these. Store fee ~15–30%.
- Implications:
  - Pricing and margins differ between web and app purchases.
  - Refer-and-earn (free credits unlocking paid features) must be structured to
    comply with store rules.
- **Card data is never handled by TaurEye** — all payment flows go through the
  provider's SDK/checkout (PCI scope stays with the provider).

---

## 7. Compliance & Security

### 7.1 SEBI (investment advice)
- Recommendations / target prices / buy-sell calls = regulated (Research Analyst
  / Investment Adviser registration). TaurEye and its AI features stay
  **factual and educational** with a clear disclaimer ("informational only, not
  investment advice, not a SEBI-registered adviser/research analyst"). Any move
  toward advisory features requires SEBI registration + legal counsel.

### 7.2 Passwords & auth
- **No plaintext passwords, ever.** Use a managed auth provider so password
  hashing/storage, resets, and OAuth are handled outside our code.

### 7.3 Privacy (India DPDP Act + general)
- Publish a Privacy Policy and Terms of Service.
- Collect consent; store only necessary personal data; encrypt in transit (HTTPS)
  and at rest; support account/data deletion.
- No personal data in URLs/query strings; least-privilege access (RLS).

### 7.4 Operational security
- API protected (auth tokens); rate limiting on AI/expensive endpoints.
- Secrets in environment/secret manager, never in the client bundle (except the
  intentionally-public API base).

---

## 8. Recommended Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Frontend | React + Capacitor (existing) | One codebase → web/Android/iOS |
| Auth + DB + storage | **Supabase** (Postgres, Auth, RLS) | Accounts/ledger without building auth from scratch |
| Market data | Existing Python engine as a scheduled job | Reuse; publishes snapshot + candles |
| Payments | Razorpay/Stripe (web) + Apple/Google IAP (apps) | Required by stores for digital goods |
| Push | FCM (+ APNs) via Capacitor Push | Cross-platform |
| AI | Server-side LLM API, credit-metered | Keeps keys server-side; educational output |

(Alternative to Supabase: custom FastAPI + Postgres + a third-party auth — more
control, more to build/maintain.)

---

## 9. Phased Roadmap

1. **Foundation — Accounts & cloud sync**
   Auth (provider), Postgres data model, migrate watchlists/screens/reports to
   the cloud, hosted/published screener data, on-device screener + native chart.
2. **Credits & payments**
   Credit ledger; web purchases (Razorpay/Stripe); then app IAP (Apple/Google).
3. **AI analysis**
   Credit-gated, educational, disclaimered LLM summaries.
4. **Push & refer-and-earn**
   FCM/APNs alerts; referral codes + rewards with anti-abuse.
5. **Store launch**
   Privacy policy/ToS, store listings, review compliance, production rollout.

Each phase is shipped and reviewed independently.

---

## 10. Open Decisions

1. **Backend:** managed (**Supabase/Firebase**, recommended for speed) vs. custom
   (FastAPI + Postgres self-run)?
2. **AI scope:** confirm **educational-only** (compliant) — advisory needs SEBI
   registration.
3. **Charts on phone:** native chart via on-demand per-symbol candle fetch
   (recommended) vs. bundled offline closes.
4. **Referral reward trigger:** on signup vs. on first qualifying purchase
   (anti-abuse + store-policy impact).
5. **Pricing model:** credit pack sizes, AI cost per run, free-tier limits.
6. **iOS build logistics:** Apple Developer account + Mac/Xcode (or cloud Mac CI).
7. **Pattern recognition:** rule-based vs ML for v1; which patterns ship first;
   scanner vs annotation scope; free vs credit-gated.
8. **Ads:** networks (AdMob mobile / AdSense or other on web); rewarded-ad credit
   reward + daily cap; no-ad pack = one-time permanent vs time-limited; mobile =
   rewarded-only or also banner/interstitial?

---

## 11. Reused vs. New

- **Reused:** React/Capacitor app shell, screener UI, native chart, branding
  (logo/wordmark/intro), Python data engine + indicator/adjustment logic.
- **New:** auth + user DB, credit ledger, payments + IAP, AI analysis, NL screen
  builder, chart pattern recognition, condition catalog, ads + no-ad pack, push,
  referral system, hosted market-data publishing, compliance/legal docs.

---

## 12. Feature Inventory (consolidated)

Legend: **[B]** built today · **[P]** planned.

**Market data & engine**
- [B] Daily EOD pipeline: NSE+BSE pull → reconcile → split/bonus adjust →
  market-cap enrich (BSE bulk by ISIN) → segment classify → indices → indicators.
- [B] 6+ yr corporate-action-adjusted history; CMP-anchored metrics.
- [P] Publish daily screener snapshot (JSON) + per-symbol candle files.
- [P] Condition Catalog computed nightly (crossovers, breakouts, new highs/lows,
  volume spikes, gaps, pattern flags) — shared by screener, NL builder, scanner, alerts.

**Screener**
- [B] Filters: price, %chg, market cap, volume, rel-volume, RSI, MACD-hist,
  %vs SMA-20/50/200, %from 52w high/low, ATR%; AND/OR, sort, limit.
- [B] Segment include/exclude (Equity/ETF/SME); predictive search; mobile slidable
  table with frozen symbol column; symbol → details.
- [P] Crossover/event conditions; on-device screening over cached snapshot (offline).

**Charts & details**
- [B] Native candlestick chart (multi-yr), D/W/M, MAs 9/20/50/200; TradingView
  widget toggle (online view only); factual Key-data panel + SEBI disclaimer.
- [P] Chart fed by our own per-symbol candle files.

**Pattern recognition (§5.7)**
- [P] Classical + candlestick + S/R patterns; per-chart annotation + scanner;
  descriptive only; credit-gated.

**AI features**
- [P] NL screen builder (§5.8): text → screen settings (LLM → constrained catalog).
- [P] AI stock analysis (§5.5): educational summary; credit-gated.

**Watchlists & alerts**
- [B] Local watchlists. [P] Cloud-synced; [P] alerts + push on conditions/patterns.

**Saved screens & reports**
- [B] Save/load screens; report generation. [P] Cloud-synced; report format TBD.

**Accounts & user data**
- [P] Auth (managed provider; hashed passwords; OAuth; verify/reset/MFA);
  Postgres user DB; data export/deletion (DPDP); privacy policy + ToS.

**Credits & monetization**
- [P] Credit ledger; purchases (web Razorpay/Stripe; apps IAP); refer-and-earn;
  daily free claim; feature gating.

**Ads (§5.9)**
- [P] Mobile rewarded ads (earn credits); web+mobile display ads; no-ad pack.

**Notifications**
- [P] Push via FCM (Android/Web) + APNs (iOS); opt-in.

**Platform & branding**
- [B] React+Capacitor → Web/Android/iOS; logo/wordmark/tagline/intro video/loading
  screen; responsive mobile UI. [P] iOS build + store listings; hosting; backend.

---

## 13. Credit Economy (DRAFT — values proposed, tune before launch)

All earn/spend actions are server-validated and recorded in the append-only
`credit_transactions` ledger.

### Faucets (earn)
| Source | Credits | Limit |
|---|---|---|
| Verified signup bonus | +10 *(draft)* | once |
| Daily free claim | **+1** | once/day |
| Rewarded ad (mobile) | **+5** | **1 ad/day** |
| Referral — referrer | +20 *(draft)* | per qualified referee |
| Referral — referee | +10 *(draft)* | once |
| Credit packs (purchase) | see below | unlimited |

### Sinks (spend) *(draft costs)*
| Feature | Cost |
|---|---|
| AI stock analysis (per run) | 10 |
| NL screen builder (per build) | 5 |
| Pattern scanner (per scan) | 5 |
| Advanced report | 10 |
| **No-ad pack** (permanent, web+mobile display ads off) | **100** *(fixed)* |

### Free (no credits)
Screener, basic charts, watchlists, saved screens, basic price/indicator alerts.

### Credit packs (purchase — DRAFT pricing)
| Price (₹) | Credits | Bonus |
|---|---|---|
| 99 | 100 | — |
| 299 | 350 | +17% |
| 599 | 750 | +25% |

### Referral qualification (draft)
Reward credited when the referee completes a **qualifying action** (proposed:
*first credit purchase* — strongest anti-abuse; alternative: verified signup +
N days active). Per-account/device caps to prevent farming.

> Economy note: keep total free faucets (claim + 1 ad + referrals) modest vs.
> feature costs so premium features remain a meaningful purchase driver, while
> the no-ad pack stays attainable for engaged free users.
