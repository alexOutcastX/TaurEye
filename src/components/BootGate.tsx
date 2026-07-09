import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { checkForUpdate } from "../lib/ota";
import LoadingScreen from "./LoadingScreen";

// Don't let a slow OTA check delay startup beyond this — boot proceeds anyway.
const OTA_CHECK_BUDGET_MS = 3000;
// Show the branded loading screen (running bull) for at least this long on the
// FIRST app entry of a session, even if the data resolves sooner.
const MIN_BOOT_MS = 5000;

// Has the app booted once in this session? BootGate is mounted inside the /app
// route, so navigating to a public page (Insights, About, a legal doc) and back
// unmounts and re-mounts it. Without this flag every such round-trip would replay
// the 5s branded intro — a real distraction. After the first warm boot we skip
// the gate entirely and render instantly; the data snapshot is already cached.
let hasBooted = false;

/**
 * Holds the app behind a loading screen until the backend's metrics snapshot is
 * warm. `api.health()` only resolves once the store has finished building the
 * whole-universe snapshot (which can take many seconds on real EOD data), so a
 * successful health response is our "all data fetched" signal. We also prime
 * /fields and /segments so the screener renders instantly once revealed.
 */
export default function BootGate({ children }: { children: ReactNode }) {
  // Already booted this session → render immediately, no loading screen.
  const [ready, setReady] = useState(hasBooted);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hasBooted) return; // warm — nothing to gate
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = performance.now();
    setError(null);
    (async () => {
      try {
        // Force an OTA update check on every startup, shown on the loading
        // screen. Capped so a slow/failed check never blocks boot. (No-op on web.)
        const otaCheck = Promise.race([
          checkForUpdate(),
          new Promise<void>((r) => setTimeout(r, OTA_CHECK_BUDGET_MS)),
        ]);
        const [h] = await Promise.all([
          api.health(),
          api.fields().catch(() => []),
          api.segments().catch(() => []),
          otaCheck,
        ]);
        if (!cancelled) {
          if (h && typeof h.universe === "number" && h.universe === 0) {
            // Store warmed but empty — surface it rather than showing a blank app.
            setError("No securities loaded. Run a data pull (taureye nightly).");
          } else {
            // Keep the running-bull intro up for at least MIN_BOOT_MS (first
            // launch only). Mark the session booted so later /app re-entries
            // skip the gate.
            const wait = Math.max(0, MIN_BOOT_MS - (performance.now() - start));
            timer = setTimeout(() => {
              if (!cancelled) {
                hasBooted = true;
                setReady(true);
              }
            }, wait);
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [attempt]);

  if (ready) return <>{children}</>;
  return <LoadingScreen error={error} onRetry={() => setAttempt((a) => a + 1)} />;
}
