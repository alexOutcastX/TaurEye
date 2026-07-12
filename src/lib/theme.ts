// Light/dark theme: persisted to localStorage and applied via a data-theme
// attribute on <html>, which flips the CSS variables in index.css. Default is
// dark (the original look); the user can switch to the light minimalist theme.

export type Theme = "light" | "dark";
const KEY = "taureye.theme";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t; // explicit user choice wins
  } catch {
    /* ignore */
  }
  // No stored choice → follow the device's light/dark setting.
  try {
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
