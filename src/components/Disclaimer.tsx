import { Link } from "react-router-dom";
import "./Disclaimer.css";

/**
 * Persistent SEBI-compliance disclaimer, shown on every screen. TaurEye is a
 * factual end-of-day information tool — NOT a SEBI-registered investment
 * adviser or research analyst, and nothing in it is investment advice. Links to
 * the full Disclaimer document.
 */
export default function Disclaimer() {
  return (
    <div className="disclaimer-bar" role="note" aria-label="Disclaimer">
      <span>
        <strong>Not investment advice.</strong> TaurEye provides factual, end-of-day
        market information for educational purposes only and is{" "}
        <strong>not a SEBI-registered</strong> investment adviser or research analyst.
        Securities investments are subject to market risks.{" "}
        <Link to="/legal/disclaimer">Full disclaimer</Link>
      </span>
    </div>
  );
}
