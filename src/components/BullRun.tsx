import "./BullRun.css";
import f0 from "../assets/bull/0.png";
import f1 from "../assets/bull/1.png";
import f2 from "../assets/bull/2.png";
import f3 from "../assets/bull/3.png";
import f4 from "../assets/bull/4.png";
import f5 from "../assets/bull/5.png";

// Six-frame gallop sprite (recoloured green, flipped to run right, all cropped
// to one shared box so the bull stays registered). Flipbooked with pure CSS
// opacity — no WebGL, so it runs fine in the Android WebView. Honours
// prefers-reduced-motion.
const FRAMES = [f0, f1, f2, f3, f4, f5];
const RATIO = 200 / 235; // frame height / width

export default function BullRun({ size = 150, className }: { size?: number; className?: string }) {
  return (
    <div
      className={`bullrun ${className ?? ""}`}
      style={{ width: size, height: Math.round(size * RATIO) }}
      aria-hidden="true"
    >
      {FRAMES.map((src, i) => (
        <img key={i} src={src} className={`br-frame br-f${i}`} alt="" draggable={false} />
      ))}
    </div>
  );
}
