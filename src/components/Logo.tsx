import { useState } from "react";
import BullMark from "./BullMark";

type Props = { size?: number; withWordmark?: boolean };

/**
 * TaurEye mark. Prefers the user's exact full-color raster at /logo.png
 * (public/logo.png) — shown as-is (the new branding is white + green, made for
 * the dark theme); falls back to the inline SVG mark if that file isn't present.
 */
export default function Logo({ size = 28, withWordmark = true }: Props) {
  const [usePng, setUsePng] = useState(true);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {usePng ? (
        <img
          src="/logo.png"
          alt="TaurEye"
          height={size}
          style={{ display: "block" }}
          onError={() => setUsePng(false)}
        />
      ) : (
        <BullMark size={size} />
      )}
      {withWordmark && (
        <span
          style={{
            fontWeight: 700,
            fontSize: size * 0.62,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          Taur<span style={{ color: "var(--accent)" }}>Eye</span>
        </span>
      )}
    </span>
  );
}
