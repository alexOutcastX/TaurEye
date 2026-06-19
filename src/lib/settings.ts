// User appearance settings — colour overrides for the screener scrip list and a
// few shared elements (gains/losses/accent). Persisted on-device and applied as
// CSS custom properties on <html>, so they layer over whatever the light/dark
// theme sets. An UNSET value falls back to the theme default — which is white on
// the dark theme and black on the light theme (see index.css), exactly the
// requested default. Inline custom properties win over the stylesheet, so an
// override holds across theme switches until the user resets it.

export interface AppSettings {
  scripColor?: string; // screener scrip symbol text
  upColor?: string; // gains / positive moves
  downColor?: string; // losses / negative moves
  accentColor?: string; // primary highlight (links, active states)
}

const KEY = "taureye.settings.v1";

// setting key -> the CSS custom property it overrides.
export const SETTING_VARS: Record<keyof AppSettings, string> = {
  scripColor: "--scrip-color",
  upColor: "--up",
  downColor: "--down",
  accentColor: "--accent",
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function getSettings(): AppSettings {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as AppSettings;
  } catch {
    return {};
  }
}

function save(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

/** Apply the overrides to <html> (or clear them, falling back to the theme). */
export function applySettings(s: AppSettings = getSettings()): void {
  const root = document.documentElement.style;
  (Object.keys(SETTING_VARS) as (keyof AppSettings)[]).forEach((k) => {
    const v = s[k];
    if (v) root.setProperty(SETTING_VARS[k], v);
    else root.removeProperty(SETTING_VARS[k]);
  });
}

export function setSettings(patch: Partial<AppSettings>): void {
  const next: AppSettings = { ...getSettings(), ...patch };
  // Drop empty values so they revert to the theme default rather than "".
  (Object.keys(next) as (keyof AppSettings)[]).forEach((k) => {
    if (!next[k]) delete next[k];
  });
  save(next);
  applySettings(next);
  listeners.forEach((l) => l());
}

export function resetSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  applySettings({});
  listeners.forEach((l) => l());
}

export function onSettingsChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
