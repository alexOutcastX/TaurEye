// A small popover to add/remove a scrip across named watchlists, with inline
// "new watchlist" creation. Rendered in a portal so it's never clipped by a
// table's overflow:auto; closes on outside-click or Escape. Used by the Screener
// row stars and the Chart page watch button.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addToWatchlist,
  createWatchlist,
  getWatchlists,
  onWatchlistChange,
  toggleInWatchlist,
  type WatchItem,
  type Watchlist,
} from "../lib/watchlist";
import "./WatchlistMenu.css";

const WIDTH = 230;

export default function WatchlistMenu({
  item,
  anchor,
  onClose,
}: {
  item: WatchItem;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<Watchlist[]>(getWatchlists());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>(() => ({
    top: anchor.bottom + 6,
    left: Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8)),
  }));

  useEffect(() => onWatchlistChange(() => setLists(getWatchlists())), []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Position the popover after it's measured: open below the star, but flip it
  // ABOVE the anchor (clamped into the viewport) when a row near the bottom would
  // otherwise push the menu off-screen. Runs before paint, so there's no flash.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const M = 8;
    const h = el.offsetHeight;
    const left = Math.max(M, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - M));
    const spaceBelow = window.innerHeight - anchor.bottom - M;
    const top = h <= spaceBelow ? anchor.bottom + 6 : Math.max(M, anchor.top - 6 - h);
    setPos({ top, left });
  }, [anchor, lists, creating]);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const wl = createWatchlist(name);
    addToWatchlist(wl.id, item);
    setNewName("");
    setCreating(false);
  };

  return createPortal(
    <div className="wlm" ref={ref} style={{ left: pos.left, top: pos.top, width: WIDTH }} role="menu">
      <div className="wlm-head">
        Add <strong>{item.symbol}</strong> to…
      </div>
      <div className="wlm-lists">
        {lists.map((l) => {
          const inList = l.items.some((w) => w.symbol === item.symbol);
          return (
            <button
              key={l.id}
              type="button"
              className={`wlm-row${inList ? " on" : ""}`}
              onClick={() => toggleInWatchlist(l.id, item)}
            >
              <span className="wlm-check">{inList ? "✓" : ""}</span>
              <span className="wlm-name">{l.name}</span>
              <span className="wlm-count">{l.items.length}</span>
            </button>
          );
        })}
      </div>
      {creating ? (
        <div className="wlm-create">
          <input
            autoFocus
            value={newName}
            placeholder="New watchlist name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <button type="button" className="wlm-add" onClick={create}>
            Add
          </button>
        </div>
      ) : (
        <button type="button" className="wlm-new" onClick={() => setCreating(true)}>
          + New watchlist
        </button>
      )}
    </div>,
    document.body,
  );
}
