import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { evaluateAlerts, getAlerts, onAlertsChange } from "../lib/alerts";
import "./AlertsBell.css";

/** Topbar bell → the Alerts page. Evaluates alerts on mount (app open) and shows
 *  a dot when any alert has triggered. */
export default function AlertsBell() {
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const refresh = () => setTriggered(getAlerts().some((a) => a.triggeredAt));
    refresh();
    const off = onAlertsChange(refresh);
    // Check alerts against the latest prices each time the app opens.
    void evaluateAlerts().then(refresh);
    return off;
  }, []);

  return (
    <Link to="/app/alerts" className="alerts-bell" title="Price alerts" aria-label="Price alerts">
      <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {triggered && <span className="alerts-bell-dot" />}
    </Link>
  );
}
