// Shareable screens — encode a ScreenRequest into a URL-safe token so any
// screen (custom, NL-built, or preset) can be shared as a plain link:
//   /app/screener?s=<token>
// The token is base64url(JSON) — fully client-side, no server storage needed
// (fits the static hosting model). Decoding is defensive: a bad token just
// yields null and the screener falls back to its default.

import type { ScreenRequest } from "../api/types";

export function encodeScreen(req: ScreenRequest): string {
  const json = JSON.stringify(req);
  // UTF-8 -> base64url (btoa handles only latin1, so escape first).
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeScreen(token: string | null): ScreenRequest | null {
  if (!token) return null;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    const req = JSON.parse(json) as ScreenRequest;
    // Minimal shape check so a mangled link can't crash the screener.
    if (!Array.isArray(req.filters) || typeof req.sort_by !== "string") return null;
    return {
      ...req,
      logic: req.logic === "OR" ? "OR" : "AND",
      limit: Math.min(Math.max(Number(req.limit) || 100, 1), 500),
    };
  } catch {
    return null;
  }
}

/**
 * The PUBLIC site origin for share links. A shared link must point at the live
 * website, NOT wherever the code happens to run — inside the APK's WebView
 * `window.location.origin` is `localhost`/`capacitor://…`, which is useless to a
 * recipient. Resolve, in order: VITE_PUBLIC_URL → the origin of an absolute
 * VITE_DATA_BASE (set for the mobile build) → the current origin if it's a real
 * (non-localhost) https site → the canonical domain.
 */
function publicOrigin(): string {
  const explicit = (import.meta.env.VITE_PUBLIC_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const dataBase = (import.meta.env.VITE_DATA_BASE ?? "").trim();
  if (/^https?:\/\//i.test(dataBase)) {
    try {
      return new URL(dataBase).origin;
    } catch {
      /* fall through */
    }
  }

  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (/^https?:\/\//i.test(o) && !/(localhost|127\.0\.0\.1|capacitor)/i.test(o)) return o;
  }

  return "https://taureye.com";
}

export function shareUrl(req: ScreenRequest): string {
  return `${publicOrigin()}/app/screener?s=${encodeScreen(req)}`;
}
