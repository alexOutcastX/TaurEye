type Props = { size?: number; className?: string };

/**
 * TaurEye mark — two mirrored angular horns (the stylized "TT"): a swept top arm
 * descending into a vertical stem that tapers to a downward spear point.
 *
 * The source artwork is solid black; since the app is dark-themed it's rendered
 * in white with a thin accent-green edge so it stays visible and on-brand. For a
 * pixel-exact raster, drop it at public/logo.png — the LoadingScreen prefers that
 * and only falls back to this mark.
 */
export default function BullMark({ size = 120, className }: Props) {
  const horn = "M24 50 L270 96 L262 440 L205 540 L148 455 L160 150 L95 120 Z";
  return (
    <svg
      width={size}
      height={(size * 580) / 600}
      viewBox="0 0 600 580"
      className={className}
      fill="none"
      aria-label="TaurEye"
      role="img"
    >
      <g
        fill="#ffffff"
        stroke="var(--accent, #18c98c)"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={horn} />
        <path d={horn} transform="matrix(-1 0 0 1 600 0)" />
      </g>
    </svg>
  );
}
