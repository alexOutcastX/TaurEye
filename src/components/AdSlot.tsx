import { useEffect, useState } from "react";
import { adsDisabled, onEconomyChange } from "../lib/economy";
import "./AdSlot.css";

type Props = { label?: string; height?: number };

/**
 * Placeholder ad slot. Real networks (AdSense on web, AdMob banner on mobile)
 * drop in here later. Hidden when the user owns the no-ad pack.
 */
export default function AdSlot({ label = "Ad space", height = 90 }: Props) {
  const [hidden, setHidden] = useState(adsDisabled());
  useEffect(() => onEconomyChange(() => setHidden(adsDisabled())), []);
  if (hidden) return null;
  return (
    <div className="ad-slot" style={{ minHeight: height }} aria-label="advertisement">
      <span className="ad-slot-tag">AD</span>
      <span className="ad-slot-text">{label} — placeholder</span>
    </div>
  );
}
