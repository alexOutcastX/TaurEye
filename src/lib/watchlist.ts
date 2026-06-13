// Local, client-side watchlists persisted to localStorage. No backend needed —
// personal lists that survive refreshes and stay on the device. A custom event
// keeps every mounted component (Screener stars, Chart, Watchlist page) in sync
// the instant anything changes, and the native "storage" event syncs across tabs.
//
// v2: multiple NAMED watchlists. The old single-list store (taureye.watchlist)
// is migrated once into a default list so existing users lose nothing.

export interface WatchItem {
  symbol: string;
  name: string;
  exchange: string;
  // Stamped when the scrip is added so the Watchlist can show entry price and
  // the change since. Optional for backward-compat with lists saved before this.
  addedAt?: string; // ISO timestamp
  addedPrice?: number; // EOD close at the moment it was added
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchItem[];
}

const KEY = "taureye.watchlists"; // v2 multi-list store
const LEGACY_KEY = "taureye.watchlist"; // v1 single-list store
const EVT = "taureye:watchlist";

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function defaultList(items: WatchItem[] = []): Watchlist {
  return { id: "default", name: "My Watchlist", items };
}

// One-time migration: fold the old single list into a default named list.
function migrateOrSeed(): Watchlist[] {
  let items: WatchItem[] = [];
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) items = (JSON.parse(legacy) as WatchItem[]) || [];
  } catch {
    /* ignore a corrupt legacy blob */
  }
  const lists = [defaultList(items)];
  try {
    localStorage.setItem(KEY, JSON.stringify(lists));
  } catch {
    /* storage may be unavailable; keep the in-memory seed */
  }
  return lists;
}

function read(): Watchlist[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const lists = JSON.parse(raw) as Watchlist[];
      if (Array.isArray(lists) && lists.length) return lists;
    }
  } catch {
    /* fall through to migrate/seed */
  }
  return migrateOrSeed();
}

function write(lists: Watchlist[]): void {
  // Always keep at least one list so new adds have a home and the UI a default.
  const next = lists.length ? lists : [defaultList()];
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
}

function stamp(item: WatchItem): WatchItem {
  return { ...item, addedAt: item.addedAt ?? new Date().toISOString() };
}

export function getWatchlists(): Watchlist[] {
  return read();
}

/** Lists that currently contain this symbol. */
export function listsWithSymbol(symbol: string): Watchlist[] {
  return read().filter((l) => l.items.some((w) => w.symbol === symbol));
}

/** In ANY list? Drives the "watched" star state. */
export function isWatched(symbol: string): boolean {
  return read().some((l) => l.items.some((w) => w.symbol === symbol));
}

export function createWatchlist(name: string): Watchlist {
  const lists = read();
  const wl: Watchlist = { id: uid(), name: name.trim() || "Untitled", items: [] };
  lists.push(wl);
  write(lists);
  return wl;
}

export function renameWatchlist(id: string, name: string): void {
  const lists = read();
  const wl = lists.find((l) => l.id === id);
  if (wl) {
    wl.name = name.trim() || wl.name;
    write(lists);
  }
}

export function deleteWatchlist(id: string): void {
  write(read().filter((l) => l.id !== id));
}

export function addToWatchlist(listId: string, item: WatchItem): void {
  const lists = read();
  const wl = lists.find((l) => l.id === listId);
  if (!wl || wl.items.some((w) => w.symbol === item.symbol)) return;
  wl.items.push(stamp(item));
  write(lists);
}

export function removeFromWatchlist(listId: string, symbol: string): void {
  const lists = read();
  const wl = lists.find((l) => l.id === listId);
  if (!wl) return;
  wl.items = wl.items.filter((w) => w.symbol !== symbol);
  write(lists);
}

/** Toggle a scrip's membership in one list. Returns the new membership. */
export function toggleInWatchlist(listId: string, item: WatchItem): boolean {
  const lists = read();
  const wl = lists.find((l) => l.id === listId);
  if (!wl) return false;
  const idx = wl.items.findIndex((w) => w.symbol === item.symbol);
  if (idx >= 0) {
    wl.items.splice(idx, 1);
    write(lists);
    return false;
  }
  wl.items.push(stamp(item));
  write(lists);
  return true;
}

/** Move a scrip from one list to another (keeps its entry stamp). */
export function moveToWatchlist(fromId: string, toId: string, symbol: string): void {
  if (fromId === toId) return;
  const lists = read();
  const from = lists.find((l) => l.id === fromId);
  const to = lists.find((l) => l.id === toId);
  if (!from || !to) return;
  const idx = from.items.findIndex((w) => w.symbol === symbol);
  if (idx < 0) return;
  const [item] = from.items.splice(idx, 1);
  if (!to.items.some((w) => w.symbol === symbol)) to.items.push(item);
  write(lists);
}

/** Remove a scrip from every list. */
export function removeFromAll(symbol: string): void {
  const lists = read();
  for (const l of lists) l.items = l.items.filter((w) => w.symbol !== symbol);
  write(lists);
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
