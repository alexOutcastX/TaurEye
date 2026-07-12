// Single theme: the app is locked to the black monochrome (dark) look. There is
// no light theme and no user-facing switch — the palette is applied once via a
// data-theme="dark" attribute on <html> (see index.css). The functions keep
// their original signatures so existing imports/callers compile unchanged.

export type Theme = "dark";
const THEME: Theme = "dark";

export function getTheme(): Theme {
  return THEME;
}

export function applyTheme(t: Theme = THEME): void {
  document.documentElement.setAttribute("data-theme", t);
}

export function setTheme(t: Theme): void {
  applyTheme(t);
}

export function toggleTheme(): Theme {
  return THEME;
}
