# TaurEye — project instructions for Claude

TaurEye is an NSE/BSE EOD stock **screener**: a React/TypeScript SPA (web +
Android/iOS via Capacitor) backed by a precomputed JSON data bundle. Indian
markets (NIFTY/BANKNIFTY/F&O context). Aimed at becoming a commercial product,
so keep things stable, SEBI-compliant (factual, non-advisory, disclaimers), and
never ship secrets.

## Architecture — STATIC hosting model (important)

The production site is **fully static**. There is **no live application backend**
in production:

- A nightly cron on the Oracle VM (`deploy/refresh.sh`) pulls EOD data into a
  large SQLite spine (`market.db`), corporate-action-adjusts it (every metric is
  anchored so the latest bar = current price), then **exports a JSON bundle**:
  `metrics.json` (all ~5,800 stocks + indicators), `fundamentals.json`,
  `indices.json`, and per-symbol `candles/<SYMBOL>.json`.
- **nginx** serves the built SPA + that bundle under `/data`.
- The **frontend does all the work client-side**: screening, indicators, chart
  pattern detection, the natural-language screener, stock detail pages. It reads
  the bundle; it does **not** call a live API in production.

### The data-source switch (`src/data/source.ts`)
- `LOCAL_DATA` (set by `VITE_DATA_SOURCE=local`) → reads the JSON bundle via
  `src/data/snapshot.ts`. **This is how production web AND the APK are built.**
- When unset → the legacy mode hits a live `/api` (uvicorn). **That backend is
  retired in production. Do NOT build/deploy in this mode or assume `/api`
  exists at runtime.**
- `src/api/client.ts` branches every call on `LOCAL_DATA`. Keep both branches in
  sync when adding endpoints, but the local branch is the one that runs live.

## Deploy / CI-CD (how changes reach users)

- Push to `main` → **GitHub Actions** (`.github/workflows/deploy.yml`) builds the
  SPA with `VITE_DATA_SOURCE=local` and rsyncs it to the VM's nginx web root,
  **excluding `data/`** (never clobber the live bundle), then reloads nginx.
  Live in ~1 min.
- **Data freshness is owned by the nightly cron**, not deploys. Code that changes
  data output only takes effect after the nightly `refresh.sh` (or a manual run
  on the VM).
- VM app path is **`/opt/taureye`** (a system path) — NOT `/home`, because Oracle
  Linux runs SELinux enforcing and denies services/cron under user home dirs.
  The static venv is `/opt/taureye/venv`; the spine is `/opt/taureye/data`.

## Hard rules — do NOT

- **Never commit secrets** (`.env`, `*.key`, `*.pem`, tokens, API keys) or the
  **SQLite DB** / data dirs. They are gitignored — keep it that way.
- **Don't reintroduce a runtime dependency on the live `/api`** in production
  paths. Production is static.
- **Don't make the deploy publish over `/data`** — the rsync must keep excluding
  `data/`.
- **Don't generate financial/investment advice.** Stock pages stay factual with
  a disclaimer.
- **Don't reproduce copyrighted text** from external sources.

## Commands

- `npm ci` — install (cloud setup script already runs this).
- `npm run dev` — local dev server (port 5174).
- `npm run build` — typecheck + Vite build → `dist/`.
- `npm run lint` — ESLint.
- Production-style build: `VITE_DATA_SOURCE=local VITE_DATA_BASE=http://161.118.174.177/data VITE_CANDLE_BASE=http://161.118.174.177/data npm run build` (nginx serves the bundle under `/data`, so the base URLs must include it).
- APK (debug): `npm run apk:debug` (build → `cap sync` → `gradlew assembleDebug`).

## Frontend layout

- `src/data/source.ts` — data-source switch + URL helpers.
- `src/data/snapshot.ts` — reads the JSON bundle (the live production path).
- `src/api/client.ts` — api facade, branches on `LOCAL_DATA`.
- `src/lib/patterns.ts` — rule-based chart pattern detection (drawn as lines).
- `src/lib/nlScreen.ts` — natural-language → screener filters (Chartink-style).
- `src/lib/economy.ts` — credit economy (DISABLED: `ECONOMY_ENABLED=false`, all
  costs/rewards 0). Dormant until turned on.
- `backend/app/dataengine/` — the exporter run nightly on the VM (pull + export).

## Mobile (APK/iOS) caveats

- The APK is a **local build** pointing data/candle base at the VM
  (`http://161.118.174.177`). Cleartext HTTP is enabled in
  `capacitor.config.ts` (`cleartext: true`) — needed until the VM has HTTPS.
- `android/local.properties` is machine-specific (SDK path) and not committed.
- Debug APKs are signed per-machine; installing a new-machine build over an
  old-machine install fails with a signature mismatch (uninstall first).
- Web changes deploy instantly; a **fresh APK rebuild** is only needed for
  **native** changes (new Capacitor plugins, `capacitor.config.ts`, permissions,
  Capacitor version). Web/code-only changes now ship over the air — see below.

### Over-the-air (OTA) updates — Capgo
- `@capgo/capacitor-updater` (configured in `capacitor.config.ts`, `autoUpdate`
  on, `defaultChannel: production`) lets installed apps pull new **web bundles**
  in the background and apply them on next launch — no Play Store / APK rebuild.
- `src/main.tsx` calls `CapacitorUpdater.notifyAppReady()` on native (no-op on
  web); skipping it makes Capgo roll back to the last good bundle.
- CI: `.github/workflows/mobile-ota.yml` builds the SPA in **mobile mode**
  (LOCAL data + VM absolute URLs, *not* same-origin `/data` like `deploy.yml`)
  and uploads to the `production` channel on every push to `main`.
- **One-time setup** before OTA works: create a Capgo account, run
  `npx @capgo/cli app add app.taureye.mobile`, add the API key as the GitHub
  secret `CAPGO_TOKEN`, set the repo variable `CAPGO_ENABLED=true`, then rebuild
  + reinstall the APK **once** so the native plugin is included.
- **OTA only updates the web layer.** Native changes still require a rebuild.

## Working style for cloud (web/phone) sessions

- Prefer small, reviewable changes (these land via PR → user merges → deploy).
- Run `npm run build` and `npm run lint` before finishing so the PR is green.
- If a change affects data output, say so — it won't show until the nightly
  refresh or a manual VM run.
