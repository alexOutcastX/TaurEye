// Local-first portfolios: positions with quantity + average cost, persisted to
// localStorage. Mirrors the watchlist store's pattern (custom event for same-tab
// sync + the native "storage" event for cross-tab). A position is qty + weighted
// average cost; valuation/risk/factor analytics are derived elsewhere from the
// EOD bundle. INFORMATIONAL/tracking only — not a demat account, not advice.
import { getWatchlists, type Watchlist } from "./watchlist";

export interface Position {
  symbol: string;
  name: string;
  exchange: string;
  qty: number;
  avgCost: number; // per-share ₹
  addedAt?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  positions: Position[];
}

const KEY = "taureye.portfolios.v1";
const EVT = "taureye:portfolios";

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function emit(): void {
  window.dispatchEvent(new Event(EVT));
}

function read(): Portfolio[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as Portfolio[];
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {
    /* fall through to seed */
  }
  const seed: Portfolio[] = [{ id: "default", name: "My Portfolio", positions: [] }];
  try {
    localStorage.setItem(KEY, JSON.stringify(seed));
  } catch {
    /* storage may be unavailable */
  }
  return seed;
}

function write(list: Portfolio[]): void {
  const next = list.length ? list : [{ id: "default", name: "My Portfolio", positions: [] }];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  emit();
}

export function getPortfolios(): Portfolio[] {
  return read();
}

export function createPortfolio(name: string): Portfolio {
  const list = read();
  const p: Portfolio = { id: uid(), name: name.trim() || "Untitled", positions: [] };
  list.push(p);
  write(list);
  return p;
}

export function renamePortfolio(id: string, name: string): void {
  const list = read();
  const p = list.find((x) => x.id === id);
  if (p) {
    p.name = name.trim() || p.name;
    write(list);
  }
}

export function deletePortfolio(id: string): void {
  write(read().filter((p) => p.id !== id));
}

/** Add or replace a position outright (used by the edit form). qty<=0 removes it. */
export function upsertPosition(id: string, pos: Position): void {
  const list = read();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  p.positions = p.positions.filter((q) => q.symbol !== pos.symbol);
  if (pos.qty > 0) p.positions.push({ ...pos, addedAt: pos.addedAt ?? new Date().toISOString() });
  write(list);
}

/** Add shares to a holding, folding into the weighted average cost. */
/** Add shares to a holding, folding into the weighted average cost. `date` (a
 *  YYYY-MM-DD trade date) is used as the entry date when creating a new holding. */
export function addShares(
  id: string,
  item: { symbol: string; name: string; exchange: string },
  qty: number,
  price: number,
  date?: string,
): void {
  if (qty <= 0 || price < 0) return;
  const list = read();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  const cur = p.positions.find((q) => q.symbol === item.symbol);
  if (cur) {
    const totalQty = cur.qty + qty;
    cur.avgCost = totalQty > 0 ? (cur.qty * cur.avgCost + qty * price) / totalQty : price;
    cur.qty = totalQty;
  } else {
    const addedAt = date ? new Date(date).toISOString() : new Date().toISOString();
    p.positions.push({ ...item, qty, avgCost: price, addedAt });
  }
  write(list);
}

export function removePosition(id: string, symbol: string): void {
  const list = read();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  p.positions = p.positions.filter((q) => q.symbol !== symbol);
  write(list);
}

/** Seed a NEW portfolio from a watchlist: 1 share per item at its entry price
 *  (or a supplied current price), so an existing list becomes a tracker instantly. */
export function seedFromWatchlist(
  watchlistId: string,
  priceFor?: (symbol: string) => number | undefined,
): Portfolio | null {
  const wl: Watchlist | undefined = getWatchlists().find((l) => l.id === watchlistId);
  if (!wl) return null;
  const positions: Position[] = wl.items.map((it) => ({
    symbol: it.symbol,
    name: it.name,
    exchange: it.exchange,
    qty: 1,
    avgCost: it.addedPrice ?? priceFor?.(it.symbol) ?? 0,
    addedAt: it.addedAt,
  }));
  const list = read();
  const p: Portfolio = { id: uid(), name: `${wl.name} (portfolio)`, positions };
  list.push(p);
  write(list);
  return p;
}

export function onPortfolioChange(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}
