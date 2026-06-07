import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import {
  getAlerts,
  onAlertsChange,
  removeAlert,
  toggleAlert,
  type PriceAlert,
} from "../lib/alerts";
import { getPushToken } from "../lib/push";
import { fmtNum, fmtStamp } from "../lib/format";
import "./Alerts.css";

export default function Alerts() {
  const nav = useNavigate();
  const [alerts, setAlerts] = useState<PriceAlert[]>(getAlerts());

  useEffect(() => onAlertsChange(() => setAlerts(getAlerts())), []);

  const openChart = (a: PriceAlert) =>
    nav(
      `/app/chart?symbol=${encodeURIComponent(a.symbol)}` +
        `&name=${encodeURIComponent(a.name)}&exchange=${encodeURIComponent(a.exchange)}`,
    );

  return (
    <section className="alerts">
      <header className="alerts-head">
        <h1>Price Alerts</h1>
        <span className="alerts-count">{alerts.length} alert{alerts.length === 1 ? "" : "s"}</span>
      </header>
      <p className="alerts-sub">
        Saved on this device. Checked each time you open the app against the latest
        end-of-day price — you'll get a notification when a level is crossed.
      </p>

      {Capacitor.isNativePlatform() && getPushToken() && (
        <details className="alerts-debug">
          <summary>Push device token (for testing)</summary>
          <code className="alerts-token">{getPushToken()}</code>
          <button
            className="mini"
            onClick={() => navigator.clipboard?.writeText(getPushToken() ?? "")}
          >
            Copy token
          </button>
        </details>
      )}

      {Capacitor.isNativePlatform() && getPushToken() && (
        <details className="alerts-debug">
          <summary>Push device token (for testing)</summary>
          <code className="alerts-token">{getPushToken()}</code>
          <button
            className="mini"
            onClick={() => navigator.clipboard?.writeText(getPushToken() ?? "")}
          >
            Copy token
          </button>
        </details>
      )}

      {alerts.length === 0 ? (
        <div className="alerts-empty">
          <p>No alerts yet.</p>
          <button className="btn-link" onClick={() => nav("/app/screener")}>
            Open a stock's chart to set one →
          </button>
        </div>
      ) : (
        <ul className="alerts-list">
          {alerts.map((a) => (
            <li key={a.id} className={`alert-row${a.triggeredAt ? " done" : ""}${a.enabled ? "" : " off"}`}>
              <button className="alert-main" onClick={() => openChart(a)}>
                <span className="alert-sym">{a.symbol}</span>
                <span className="alert-cond">
                  {a.op === "above" ? "Above" : "Below"} ₹{fmtNum(a.price)}
                </span>
                <span className="alert-state">
                  {a.triggeredAt
                    ? `Triggered @ ₹${fmtNum(a.triggeredPrice ?? a.price)} · ${fmtStamp(a.triggeredAt)}`
                    : a.enabled
                      ? "Active"
                      : "Paused"}
                </span>
              </button>
              <div className="alert-actions">
                <button className="mini" onClick={() => toggleAlert(a.id)} title={a.enabled ? "Pause / re-arm" : "Resume"}>
                  {a.enabled ? "Pause" : "Resume"}
                </button>
                <button className="mini danger" onClick={() => removeAlert(a.id)} title="Delete alert">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
