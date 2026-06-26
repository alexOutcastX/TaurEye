// Shareable watchlists — encode a list (name + scrips) into a URL-safe token so
// it can be shared as a plain link:  /app/watchlist?w=<token>
// base64url(JSON), fully client-side (fits the static hosting model). Decoding is
// defensive: a bad token just yields null. Only the scrip identity is shared
// (symbol/name/exchange) — not your personal entry price/date.

import { publicOrigin } from "./share";
import type { WatchItem } from "./watchlist";

type SharedWL = { n: string; i: { s: string; n: string; e: string }[] };

type WatchlistLike = { name: string; items: WatchItem[] };

export function encodeWatchlist(wl: WatchlistLike): string {
  const payload: SharedWL = {
    n: wl.name,
    i: wl.items.slice(0, 250).map((w) => ({ s: w.symbol, n: w.name, e: w.exchange })),
  };
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeWatchlist(token: string | null): WatchlistLike | null {
  if (!token) return null;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(decodeURIComponent(escape(atob(b64)))) as SharedWL;
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
  } catch {
    return null;
  }
}

export function watchlistShareUrl(wl: WatchlistLike): string {
  return `${publicOrigin()}/app/watchlist?w=${encodeWatchlist(wl)}`;
}
