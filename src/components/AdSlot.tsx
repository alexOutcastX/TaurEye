import { useEffect, useRef, useState } from "react";
import { adsDisabled, onEconomyChange } from "../lib/economy";
import { ADSENSE_CLIENT, adsenseSlot, ensureAdSenseScript, isNative } from "../config/ads";
import "./AdSlot.css";

type Props = { label?: string; height?: number; name?: string };

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * In-flow ad slot.
 *  - Web, configured: renders a real Google AdSense unit (when `name` maps to a
 *    slot id in config/ads.ts and VITE_ADSENSE_CLIENT is set).
 *  - Native: renders nothing — AdMob shows its own banner overlay (see lib/ads).
 *  - Otherwise (dev / unconfigured): the dashed placeholder.
 * Hidden entirely when the user owns the no-ad pack.
 */
export default function AdSlot({ label = "Ad space", height = 90, name }: Props) {
  const [hidden, setHidden] = useState(adsDisabled());
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => onEconomyChange(() => setHidden(adsDisabled())), []);

  const slot = adsenseSlot(name);

  useEffect(() => {
    if (hidden || !slot || pushed.current) return;
    pushed.current = true;
    ensureAdSenseScript().then(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* adsbygoogle not ready / blocked — ignore */
      }
    });
  }, [hidden, slot]);

  if (hidden) return null;
  if (isNative) return null; // native uses the AdMob banner overlay

  // Real AdSense unit.
  if (slot) {
    return (
      <ins
        ref={insRef}
        className="adsbygoogle ad-slot-live"
        style={{ display: "block", minHeight: height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        aria-label="advertisement"
      />
    );
  }

  // Dev / unconfigured placeholder.
  return (
    <div className="ad-slot" style={{ minHeight: height }} aria-label="advertisement">
      <span className="ad-slot-tag">AD</span>
      <span className="ad-slot-text">{label} — placeholder</span>
    </div>
  );
}
