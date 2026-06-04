import { useEffect, useState } from "react";
import BullMark from "./BullMark";
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
 * Boot loading screen. Plays the branded intro video (public/intro.mp4) while
 * the backend snapshot warms; falls back to the static logo mark if the video
 * can't load. Reveals the app once BootGate's data check resolves.
 */
export default function LoadingScreen({ error, onRetry }: Props) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [msg, setMsg] = useState(0);
  const showVideo = !error && !videoFailed;

  // Advance the status line while the snapshot warms (keeps the wait informative).
  useEffect(() => {
    if (error) return;
    const id = setInterval(
      () => setMsg((m) => Math.min(m + 1, MESSAGES.length - 1)),
      2200,
    );
    return () => clearInterval(id);
  }, [error]);

  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-inner">
        {showVideo ? (
          <video
            className="boot-video"
            src="/intro.mp4"
            poster="/intro-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <>
            <div className={`boot-logo${error ? "" : " pulsing"}`}>
              <LogoFallback />
            </div>
            <div className="boot-wordmark">
              Taur<span>Eye</span>
            </div>
          </>
        )}

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
            <div className="boot-bar">
              <span />
            </div>
            <p className="boot-msg">{MESSAGES[msg]}</p>
          </>
        )}
      </div>
    </div>
  );
}

// Static fallback when the video is unavailable: the logo raster, else the SVG.
function LogoFallback() {
  const [usePng, setUsePng] = useState(true);
  return usePng ? (
    <img src="/logo.png" alt="TaurEye" width={150} onError={() => setUsePng(false)} />
  ) : (
    <BullMark size={150} />
  );
}
