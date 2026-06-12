import { useEffect, useState } from "react";
import BullRun from "./BullRun";
import { getOtaStatus, onOtaChange, otaMessage, type OtaStatus } from "../lib/ota";
import "./LoadingScreen.css";

const MESSAGES = [
  "Connecting to market data…",
  "Loading the security universe…",
  "Computing indicators across years of history…",
  "Adjusting for splits & bonuses…",
  "Almost there…",
];

type Props = { error?: string | null; onRetry?: () => void };

/**
 * Boot loading screen. Shows the running-bull flipbook while the snapshot warms,
 * with an indeterminate progress bar (or a determinate OTA download bar) and a
 * rotating status line. Reveals the app once BootGate's data check resolves.
 */
export default function LoadingScreen({ error, onRetry }: Props) {
  const [msg, setMsg] = useState(0);
  const [ota, setOta] = useState<OtaStatus>(getOtaStatus());

  // Surface Capgo OTA progress (native only; stays "idle" on web).
  useEffect(() => onOtaChange(setOta), []);

  // Advance the status line while the snapshot warms (keeps the wait informative).
  useEffect(() => {
    if (error) return;
    const id = setInterval(
      () => setMsg((m) => Math.min(m + 1, MESSAGES.length - 1)),
      2200,
    );
    return () => clearInterval(id);
  }, [error]);

  // An in-flight update takes over the status line and drives the bar.
  const otaLine = otaMessage(ota);
  const downloading = ota.state === "downloading";

  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-inner">
        <BullRun size={170} className="boot-bull" />
        <div className="boot-wordmark">
          Taur<span>Eye</span>
        </div>

        {error ? (
          <div className="boot-error">
            <p>Couldn’t reach the backend.</p>
            <p className="boot-error-detail">{error}</p>
            {onRetry && (
              <button className="boot-retry" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={`boot-bar${downloading ? " det" : ""}`}>
              <span style={downloading ? { width: `${ota.percent}%` } : undefined} />
            </div>
            <p className="boot-msg">{otaLine ?? MESSAGES[msg]}</p>
          </>
        )}
      </div>
    </div>
  );
}
