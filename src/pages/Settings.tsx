import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getSettings,
  onSettingsChange,
  resetSettings,
  setSettings,
  SETTING_VARS,
  type AppSettings,
} from "../lib/settings";
import { supabase } from "../lib/supabase";
import "./Settings.css";

const FIELDS: { key: keyof AppSettings; label: string; desc: string }[] = [
  {
    key: "scripColor",
    label: "Scrip text (screener)",
    desc:
      "Colour of the scrip symbols in the screener list. Default is white on the dark theme and black on the light theme.",
  },
  {
    key: "upColor",
    label: "Gains (positive)",
    desc: "Colour used for positive changes / up moves across the app.",
  },
  {
    key: "downColor",
    label: "Losses (negative)",
    desc: "Colour used for negative changes / down moves across the app.",
  },
  {
    key: "accentColor",
    label: "Accent",
    desc: "Primary highlight colour — links, active tabs and buttons.",
  },
];

// Normalise any CSS colour (hex / rgb / named) to #rrggbb for <input type=color>.
function toHex(c: string): string {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return "#000000";
    ctx.fillStyle = "#000000";
    ctx.fillStyle = c;
    const out = ctx.fillStyle;
    return out.startsWith("#") ? out : "#000000";
  } catch {
    return "#000000";
  }
}

function themeValue(key: keyof AppSettings): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(SETTING_VARS[key])
    .trim();
  return toHex(v || "#888888");
}

export default function Settings() {
  const [s, setS] = useState<AppSettings>(getSettings());
  useEffect(() => onSettingsChange(() => setS(getSettings())), []);

  // Show the analytics link only to admins (app_admins via supabase/analytics.sql).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.rpc("is_admin").then(({ data }) => {
      if (alive) setIsAdmin(data === true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="settings">
      <header className="settings-head">
        <h1>Settings</h1>
        <p className="settings-sub">
          Personalise the app's colours. Saved on this device; defaults follow your
          light/dark theme.
        </p>
      </header>

      <div className="set-card">
        <h2 className="set-card-title">Colours</h2>
        {FIELDS.map((f) => {
          const overridden = !!s[f.key];
          const value = s[f.key] || themeValue(f.key);
          return (
            <div className="set-row" key={f.key}>
              <div className="set-row-main">
                <span className="set-label">{f.label}</span>
                <p className="set-desc">{f.desc}</p>
              </div>
              <div className="set-controls">
                <label className="set-swatch" style={{ background: value }}>
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => setSettings({ [f.key]: e.target.value })}
                    aria-label={f.label}
                  />
                </label>
                <span className="set-state">{overridden ? value : "Theme default"}</span>
                {overridden && (
                  <button
                    type="button"
                    className="set-clear"
                    onClick={() => setSettings({ [f.key]: "" })}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="set-actions">
        <button type="button" className="set-reset-all" onClick={resetSettings}>
          Reset all to theme defaults
        </button>
      </div>

      <p className="set-note">
        Overrides apply on both the light and dark themes until you reset them.
        Leaving a colour unset keeps the theme default — white on black, black on white.
      </p>

      {isAdmin && (
        <div className="set-card">
          <h2 className="set-card-title">Admin</h2>
          <div className="set-row">
            <div className="set-row-main">
              <span className="set-label">Product analytics</span>
              <p className="set-desc">Usage dashboards: active users, feature adoption, per-account activity.</p>
            </div>
            <div className="set-controls">
              <Link to="/app/admin" className="set-clear">Open analytics →</Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
