// Local, client-side watchlist persisted to localStorage. No backend needed —
// it's a personal list that survives refreshes and stays on the device. A custom
// event keeps every mounted component (Screener buttons, Watchlist page) in sync
// the instant the list changes, and the native "storage" event syncs across tabs.

export interface WatchItem {
  symbol: string;
  name: string;
  exchange: string;
  // Stamped when the scrip is added so the Watchlist can show entry price and
  // the change since. Optional for backward-compat with lists saved before this.
  addedAt?: string; // ISO timestamp
  addedPrice?: number; // EOD close at the moment it was added
}

const KEY = "taureye.watchlist";
const EVT = "taureye:watchlist";

export function getWatchlist(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WatchItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: WatchItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVT));
}

export function isWatched(symbol: string): boolean {
  return getWatchlist().some((w) => w.symbol === symbol);
}

/** Add if absent, remove if present. Returns the new watched state. */
export function toggleWatch(item: WatchItem): boolean {
  const items = getWatchlist();
  const idx = items.findIndex((w) => w.symbol === item.symbol);
  if (idx >= 0) {
    items.splice(idx, 1);
    save(items);
    return false;
  }
  // Stamp the entry date/price now (unless the caller already set addedAt).
  items.push({ ...item, addedAt: item.addedAt ?? new Date().toISOString() });
  save(items);
  return true;
}

export function removeWatch(symbol: string): void {
  save(getWatchlist().filter((w) => w.symbol !== symbol));
}

/** Subscribe to changes (same-tab custom event + cross-tab storage event). */
export function onWatchlistChange(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}
