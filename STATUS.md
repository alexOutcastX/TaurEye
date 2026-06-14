# TaurEye — Where We Are

Product status, launch-readiness & competitive comparison. NSE/BSE end-of-day
stock screener (web + Android), static JSON data bundle + Supabase cloud layer.

_Last updated: 14 June 2026._

## 1. Where We Are — detailed status

| Area | Feature | Status | Notes |
|---|---|---|---|
| Screening | Filter-based screener | 🟢 Live | Over the metrics bundle (~5,800 stocks) |
| Screening | Natural-language screener | 🟢 Live | Plain-English → filters; signature feature |
| Screening | Saved screens | 🟢 Live | Local; cloud table exists in schema |
| Charts | Native charts (lightweight-charts) | 🟢 Live | Timeframes, moving averages |
| Charts | TradingView widget toggle | 🟢 Live | TV's own data |
| Charts | Auto pattern detection | 🟢 Live | Drawn as lines (`patterns.ts`) |
| Charts | Per-stock Key Data | 🟢 Live | RSI, SMA50/200, 52w, ATR + SEBI disclaimer |
| Data | Dashboard home (Market Pulse) | 🟢 Live | Index cards, breadth, sector heatmap, movers; post-login home |
| Data | Global indices dashboard | 🟢 Live | + ticker |
| Data | Scrip search | 🟢 Live | |
| Engagement | Watchlists | 🟢 Live | |
| Engagement | EOD price alerts | 🟢 Live | Above/below |
| Engagement | Push notifications (FCM) | 🟢 Live | Native, via Firebase |
| Engagement | Light/dark theme | 🟢 Live | |
| Accounts | Supabase auth (email + guest) | 🟢 Live | |
| Accounts | Cloud credit wallet | 🟢 Live | Server balance, unforgeable (RLS) |
| Accounts | Signup bonus (50) + daily claim (5) | 🟢 Live | Secure RPCs |
| Accounts | Referral program | 🟡 Partial | Tables + page exist; reward grant not wired |
| AI / Reports | AI stock analysis | 🟢 Live | Haiku via Edge Function; charged 10 credits server-side |
| AI / Reports | Advanced report | 🟢 Live | Charged 5 credits server-side; refund on failure |
| Monetization | Credit charging | 🟢 **LIVE** | `CHARGE_CREDITS=true`; server-authoritative, badge live-refresh |
| Monetization | Broker affiliate (Zerodha) | 🟢 **LIVE & earning** | Angel/Upstox/Dhan = paste links |
| Monetization | Ads — AdSense (web) | 🟡 Built, gated | Needs `ca-pub-…` + unit IDs |
| Monetization | Ads — AdMob (app) | 🟡 Built, gated | Needs IDs + APK rebuild |
| Monetization | Razorpay credit purchases | 🟡 Built | Webhook exists; needs checkout + keys |
| Monetization | Pro subscription | ⚪ Planned | Phase D (₹999/yr) |
| Compliance | Legal pages (Terms/Privacy/Refund/Disclaimer) | 🟢 Live | Public `/legal/*`; entity details in `config/legal.ts` |
| Compliance | Web launch hygiene | 🟢 Live | robots.txt, sitemap, PWA manifest, signup consent, cookie notice, 404 |
| Compliance | Security hardening | 🟢 Live | RLS + `security_invoker` balance view + anon EXECUTE locked down |
| Platforms | Web (nginx, static) | 🟢 Live | Deploys from `main` in ~1 min |
| Platforms | Android APK | 🟢 Builds | GitHub Actions |
| Platforms | OTA updates (Capgo) | 🟡 Wired | Needs `CAPGO_TOKEN` + `CAPGO_ENABLED` + one rebuild |
| Platforms | iOS | ⚪ Scaffolded | Not a current build target |
| Infra | Nightly data pipeline | 🟢 Live | EOD → CA-adjust → JSON export |
| Infra | Compliance (SEBI/secrets) | 🟢 In place | Factual-only, keys server-side |

## 2. Pending for production launch

| Item | Priority | Owner | Note |
|---|---|---|---|
| HTTPS on the VM | 🔴 Blocker | You / infra | Cleartext HTTP today; needed for trust + iOS ATS. TLS cert → flip bases to https |
| Lawyer review of legal text | 🔴 Blocker | You | SEBI / DPDP / GST specifics before public launch |
| Fill `config/legal.ts` | 🟠 High | You → me | Registered name, support/grievance email, jurisdiction |
| Broker affiliate links | 🟠 High | You → me | Paste Angel One / Upstox / Dhan partner URLs (fast revenue) |
| Razorpay credit-pack checkout | 🟠 High | Me + You | I build checkout + create-order fn; goes live on your keys + deploy |
| Capgo OTA setup | 🟡 Medium | You | `CAPGO_TOKEN` secret + `CAPGO_ENABLED=true` + one APK rebuild |
| Signed store release builds | 🟡 Medium | You | Release APK/AAB + iOS provisioning + store listings/data-safety |
| AdMob / AdSense IDs | 🟡 Medium | You | Production unit IDs + consent wiring |
| Referral reward grant | 🟡 Medium | Me | Wire the referrer/referee credit grant (tables + page exist) |
| Pro subscription (Phase D) | ⚪ Later | Me + You | Razorpay subscriptions + monthly credit grant |
| Leaked-password protection | ⚪ Skipped | — | Supabase Pro-only feature; deferred |

## 3. Comparison with peers

| Capability | TaurEye | screener.in | Chartink | Trendlyne | TradingView |
|---|---|---|---|---|---|
| Primary focus | Unified EOD screener (fund + tech) | Fundamentals | Technical scans | Everything (fund+tech+analyst) | Charting platform |
| Fundamentals depth | Key ratios (growing) | Deep (10-yr) ★ | Minimal | Broad + DVM scores | Weak (India) |
| Technical screening | Yes | Weak | Strong ★ | Yes | Generic |
| Intraday / real-time | No (EOD only) | No | Yes (near real-time) | Partial | Yes ★ |
| NL / plain-English screen | Yes ★ | No (query lang) | No (own syntax) | No | No (Pine Script) |
| Charting | Good | Basic | Basic | Decent | World-class ★ |
| Auto pattern detection | Yes (drawn for you) | No | Via scans | Some | Via Pine/indicators |
| Alerts | Yes (EOD + push) | Limited | Yes | Yes (paywalled) | Yes |
| AI stock analysis | Yes (built-in, Haiku) | No | No | Some | Limited |
| Mobile app quality | Mobile-first native ★ | Mediocre | Mediocre | OK | Good |
| India focus | Yes | Yes | Yes | Yes | No |
| Price / year | **Free / ₹999 Pro** | ~₹5,000 | ~₹2,400 | ₹999–6,000 | ~₹12,000+ (INR) |
| Free tier | Generous ★ | Limited | Yes (ads) | Heavily paywalled | Limited |

**Our wedge:** we don't beat any one of them at their core strength — instead we
**bundle fundamentals + technicals + plain-English search + AI + patterns + alerts
into one fast, mobile-first app, free to start**, undercutting a field where everyone
else charges ₹2.4k–12k and silos their features.
