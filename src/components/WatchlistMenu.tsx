// A small popover to add/remove a scrip across named watchlists, with inline
// "new watchlist" creation. Rendered in a portal so it's never clipped by a
// table's overflow:auto; closes on outside-click or Escape. Used by the Screener
// row stars and the Chart page watch button.
import { useEffect, useRef, useState } from "react";
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

  // Position below the anchor, right-aligned, clamped into the viewport.
  const left = Math.max(8, Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8));
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 12);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const wl = createWatchlist(name);
    addToWatchlist(wl.id, item);
    setNewName("");
    setCreating(false);
  };

  return createPortal(
    <div className="wlm" ref={ref} style={{ left, top, width: WIDTH }} role="menu">
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
