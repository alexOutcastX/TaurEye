import "./BullRun.css";

/**
 * Tiny 2D galloping bull — original flat-design silhouette in the style of a
 * side-view running bull (lowered head, shoulder hump, tufted tail), animated
 * with transform-only CSS so it runs on the compositor at the display's native
 * refresh (60–120fps) with no WebGL (safe in the Android WebView). The four legs
 * share one gallop keyframe with staggered delays for a galloping gait; the body
 * pitches and bobs and the tail swishes. Honours prefers-reduced-motion.
 */
export default function BullRun({ size = 120, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={`bullrun ${className ?? ""}`}
      width={size}
      height={(size * 100) / 150}
      viewBox="0 0 150 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2be3a6" />
          <stop offset="1" stopColor="#0e9c72" />
        </linearGradient>
      </defs>

      <g className="br-body">
        {/* far legs (drawn first = behind), slightly darker */}
        <line className="br-leg br-far br-l4" x1="44" y1="64" x2="40" y2="92" />
        <line className="br-leg br-far br-l2" x1="108" y1="64" x2="106" y2="92" />
        {/* near legs */}
        <line className="br-leg br-l3" x1="52" y1="64" x2="49" y2="94" />
        <line className="br-leg br-l1" x1="116" y1="62" x2="116" y2="94" />

        {/* tail with tuft */}
        <path className="br-tail" d="M30 42 q-13 4 -16 17" />
        <circle className="br-tuft" cx="14" cy="60" r="3" />

        {/* torso — leaner topline with an integrated shoulder hump, lowered head */}
        <path
          d="M30 40 Q55 33 78 37 Q95 27 110 37 Q122 43 132 51 Q140 53 146 59 L146 64 Q140 66 134 64 Q126 62 120 60 Q116 66 112 70 Q80 74 52 72 Q40 71 34 64 Q27 52 30 40 Z"
          fill="url(#brg)"
        />
        {/* muzzle */}
        <ellipse cx="145" cy="61" rx="4.5" ry="4.5" fill="url(#brg)" />

        {/* horns + ear + eye */}
        <path className="br-horn" d="M128 50 q-4 -11 5 -14" />
        <path className="br-horn" d="M135 51 q-1 -11 8 -12" />
        <path d="M122 50 l-6 -3 1 7 Z" fill="url(#brg)" />
        <circle cx="138" cy="58" r="1.6" className="br-eye" />
      </g>

      {/* ground speed lines */}
      <g className="br-ground">
        <line x1="10" y1="97" x2="34" y2="97" />
        <line x1="58" y1="99" x2="86" y2="99" />
        <line x1="104" y1="97" x2="132" y2="97" />
      </g>
    </svg>
  );
}
