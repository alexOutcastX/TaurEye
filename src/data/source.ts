// Data-source switch for the serverless / on-device build.
//
// The hosted web app talks to the live FastAPI backend (the default). The
// packaged mobile (APK) build can instead read everything the screener needs
// from the precomputed JSON bundle published by `taureye export` — so the app
// runs fully offline with no backend round-trip.
//
// Turn it on at build time:
//   VITE_DATA_SOURCE=local npm run build      (or `npm run dev` to try it on web)
//
// Where the bundle lives:
//   VITE_DATA_BASE=https://cdn.example.com/taureye   (a hosted/CDN bundle), or
//   leave it empty to read a bundle copied into the app's own public/data/.
//
// Charts only — the candle files are big (full per-symbol history), so they are
// NOT shipped inside the APK. Point them at a host that streams them on demand:
//   VITE_CANDLE_BASE=https://data.example.com   (serves /candles/<SYMBOL>.json)
// When VITE_CANDLE_BASE is unset it falls back to DATA_BASE, so a fully-bundled
// build still works if the candles happen to be present locally.
//
// This split lets the screener/fundamentals/indices stay bundled (offline) while
// only charts reach the network — the recommended mobile setup.
//
// When LOCAL_DATA is false (the default) NOTHING changes — the api client and
// auth behave exactly as before, so the existing hosted path is untouched.
export const LOCAL_DATA = import.meta.env.VITE_DATA_SOURCE === "local";

// AI delivery mode — selected at build time so the two transition deployments
// share one codebase (see docs/TWO-VERSIONS.md):
//   'cache' (default) — AI analysis/reports are served ONLY from the nightly
//      pre-generated bundle (reports/<SYMBOL>.json): ₹0, no Edge Functions, no
//      Anthropic. This is the self-hosted / cost-zero build.
//   'live' — same nightly cache first, but symbols WITHOUT a cached file fall
//      back to the Supabase Edge Functions (ai-analysis / ai-report → Anthropic).
//      This is the pre-self-hosting "Oracle VM + Cloud Supabase + Anthropic" build.
// Anything other than the literal "live" is treated as "cache" (fail-safe to ₹0).
export const AI_MODE = import.meta.env.VITE_AI_MODE === "live" ? "live" : "cache";
export const AI_LIVE = AI_MODE === "live";

// The copy of the bundle that ships INSIDE the app (Vite copies public/data/ into
// dist/). Always available, even with no network — used as the offline fallback.
export const BUNDLED_BASE = `${import.meta.env.BASE_URL}data`;

// Base URL of the published JSON bundle (manifest.json, metrics.json, …).
// Trailing slash stripped. When VITE_DATA_BASE points at a host (e.g. the VM),
// the app fetches fresh data from there on each launch and auto-updates — and
// falls back to BUNDLED_BASE if the host is unreachable (see snapshot.ts).
// When unset, it just reads the in-app bundle (the classic offline build).
const RAW_BASE = (import.meta.env.VITE_DATA_BASE ?? "").trim().replace(/\/$/, "");
export const DATA_BASE = RAW_BASE || BUNDLED_BASE;

// Base URL for the per-symbol candle files (charts). Defaults to DATA_BASE so
// behaviour is unchanged unless you explicitly point charts at a host.
const RAW_CANDLE_BASE = (import.meta.env.VITE_CANDLE_BASE ?? "").trim().replace(/\/$/, "");
export const CANDLE_BASE = RAW_CANDLE_BASE || DATA_BASE;

/** URL of a file in the (possibly remote) published bundle. */
export function dataUrl(name: string): string {
  return `${DATA_BASE}/${name}`;
}

/** URL of the same file in the in-app bundle (offline fallback). */
export function bundledUrl(name: string): string {
  return `${BUNDLED_BASE}/${name}`;
}

/** URL of one symbol's candle file (may live on a different host than the bundle). */
export function candleUrl(symbol: string): string {
  return `${CANDLE_BASE}/candles/${encodeURIComponent(symbol)}.json`;
}
