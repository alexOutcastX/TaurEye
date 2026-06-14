import { useState } from "react";
import { Link } from "react-router-dom";
import "./ConsentBanner.css";

const KEY = "taureye.consent.v1";

/** One-time notice about local storage / cookies, dismissed permanently. Links
 *  to the Privacy Policy (DPDP-friendly; needed once ads/analytics run). */
export default function ConsentBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return true;
    }
  });
  if (dismissed) return null;

  const accept = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="consent" role="dialog" aria-label="Privacy notice">
      <p>
        We use local storage and cookies to keep you signed in and remember your
        preferences. See our <Link to="/legal/privacy">Privacy Policy</Link>.
      </p>
      <button onClick={accept} className="consent-ok">
        Got it
      </button>
    </div>
  );
}
