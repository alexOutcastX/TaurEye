import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { checkForUpdate } from "../lib/ota";
import LoadingScreen from "./LoadingScreen";

// Don't let a slow OTA check delay startup beyond this — boot proceeds anyway.
const OTA_CHECK_BUDGET_MS = 3000;

/**
 * Holds the app behind a loading screen until the backend's metrics snapshot is
 * warm. `api.health()` only resolves once the store has finished building the
 * whole-universe snapshot (which can take many seconds on real EOD data), so a
 * successful health response is our "all data fetched" signal. We also prime
 * /fields and /segments so the screener renders instantly once revealed.
 */
export default function BootGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
            setReady(true);
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (ready) return <>{children}</>;
  return <LoadingScreen error={error} onRetry={() => setAttempt((a) => a + 1)} />;
}
