// Shareable watchlists — encode a list (name + scrips) into a URL-safe token so
// it can be shared as a plain link:  /app/watchlist?w=<token>
// The token is lz-string-compressed JSON (URL-safe), fully client-side (fits the
// static hosting model). Compression cuts the link length ~70% vs raw base64url.
// Decoding is defensive and back-compatible: it tries the compressed form first,
// then falls back to the legacy base64url tokens so older links still open. Only
// scrip identity is shared (symbol/name/exchange) — not your entry price/date.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { publicOrigin } from "./share";
import type { WatchItem } from "./watchlist";

type SharedWL = { n: string; i: { s: string; n: string; e: string }[] };

type WatchlistLike = { name: string; items: WatchItem[] };

export function encodeWatchlist(wl: WatchlistLike): string {
  const payload: SharedWL = {
    n: wl.name,
    i: wl.items.slice(0, 250).map((w) => ({ s: w.symbol, n: w.name, e: w.exchange })),
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

// Validate + normalise a decoded payload; returns null if the shape is wrong.
function normalizeWatchlist(p: SharedWL): WatchlistLike | null {
  if (!Array.isArray(p.i)) return null;
  const items: WatchItem[] = p.i
    .filter((x) => x && typeof x.s === "string" && x.s)
    .map((x) => ({
      symbol: String(x.s).toUpperCase(),
      name: String(x.n ?? x.s),
      exchange: String(x.e ?? "NSE"),
    }));
  if (!items.length) return null;
  return { name: (p.n || "Shared watchlist").slice(0, 60), items };
}

// Legacy base64url(JSON) decode — kept so links shared before lz-string still work.
function decodeLegacyWatchlist(token: string): WatchlistLike | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    return normalizeWatchlist(JSON.parse(decodeURIComponent(escape(atob(b64)))) as SharedWL);
  } catch {
    return null;
  }
}

export function decodeWatchlist(token: string | null): WatchlistLike | null {
  if (!token) return null;
  // Try the compressed form first.
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (json) {
      const wl = normalizeWatchlist(JSON.parse(json) as SharedWL);
      if (wl) return wl;
    }
  } catch {
    /* fall through to legacy */
  }
  return decodeLegacyWatchlist(token);
}

export function watchlistShareUrl(wl: WatchlistLike): string {
  return `${publicOrigin()}/app/watchlist?w=${encodeWatchlist(wl)}`;
}
