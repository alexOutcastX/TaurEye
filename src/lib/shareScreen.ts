// Shareable screens — encode a ScreenRequest into a URL-safe token so any
// screen (custom, NL-built, or preset) can be shared as a plain link:
//   /app/screener?s=<token>
// The token is lz-string-compressed JSON (URL-safe) — fully client-side, no
// server storage needed (fits the static hosting model). Compression cuts the
// link length ~70% vs raw base64url. Decoding is defensive and back-compatible:
// it first tries the compressed form, then falls back to the legacy base64url
// tokens so links shared before this change still open. A bad token just
// yields null and the screener falls back to its default.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { ScreenRequest } from "../api/types";
import { publicOrigin } from "./share";

export function encodeScreen(req: ScreenRequest): string {
  return compressToEncodedURIComponent(JSON.stringify(req));
}

// Validate + normalise a decoded request; returns null if the shape is wrong.
function normalizeScreen(req: ScreenRequest): ScreenRequest | null {
  if (!Array.isArray(req.filters) || typeof req.sort_by !== "string") return null;
  return {
    ...req,
    logic: req.logic === "OR" ? "OR" : "AND",
    limit: Math.min(Math.max(Number(req.limit) || 100, 1), 500),
  };
}

// Legacy base64url(JSON) decode — kept so links shared before lz-string still work.
function decodeLegacyScreen(token: string): ScreenRequest | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const req = JSON.parse(decodeURIComponent(escape(atob(b64)))) as ScreenRequest;
    return normalizeScreen(req);
  } catch {
    return null;
  }
}

export function decodeScreen(token: string | null): ScreenRequest | null {
  if (!token) return null;
  // Try the compressed form first.
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (json) {
      const req = normalizeScreen(JSON.parse(json) as ScreenRequest);
      if (req) return req;
    }
  } catch {
    /* fall through to legacy */
  }
  return decodeLegacyScreen(token);
}

export function shareUrl(req: ScreenRequest): string {
  return `${publicOrigin()}/app/screener?s=${encodeScreen(req)}`;
}
