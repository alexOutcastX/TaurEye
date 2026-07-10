import { useState } from "react";
import BullMark from "./BullMark";

/**
 * Static low-poly bull-head graphic (a pre-rendered PNG of the 3D model) used as
 * the hero fallback: shown while the WebGL bull is deferred/loading, on native
 * where WebGL is skipped, and whenever WebGL is unavailable on the device. It
 * looks like the real thing, so a missing GPU never leaves visitors with a bare
 * logo. If the raster itself fails to load, we drop back to the vector mark.
 *
 * The intrinsic image is 772×708; `size` sets the rendered width and CSS classes
 * (e.g. `.lp-bull-fallback`, `.lp-bull`) can still stretch it to fill the hero.
 */
export default function BullHero({ size = 220, className }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BullMark size={size} className={className} />;
  return (
    <img
      src="/bull-hero.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * 708) / 772)}
      className={className}
      style={{ objectFit: "contain" }}
      fetchPriority="high"
      onError={() => setFailed(true)}
    />
  );
}
