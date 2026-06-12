import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Security } from "../api/types";
import "./ScripSearch.css";

/**
 * Predictive scrip search for the topbar. Debounced lookups against
 * /api/securities; arrow-key + Enter navigation; selecting a result opens that
 * scrip's chart/info page. Purely a lookup utility — no recommendations.
 */
export default function ScripSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Security[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      api
        .searchSecurities(term, 8)
        .then((r) => {
          setResults(r);
          setActive(0);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(id);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (s: Security) => {
    setOpen(false);
    setQ("");
    setResults([]);
    nav(
      `/app/chart?symbol=${encodeURIComponent(s.symbol)}` +
        `&name=${encodeURIComponent(s.name)}&exchange=${encodeURIComponent(s.exchange)}`,
    );
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="scrip-search" ref={boxRef}>
      <div className="search">
        <SearchIcon />
        <input
          placeholder="Search stocks"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKey}
          aria-label="Search stocks"
          autoComplete="off"
        />
      </div>

      {open && (
        <ul className="scrip-dd" role="listbox">
          {results.length === 0 && !loading && (
            <li className="scrip-dd-empty">No matches</li>
          )}
          {results.map((s, i) => (
            <li
              key={s.isin || s.symbol}
              role="option"
              aria-selected={i === active}
              className={`scrip-dd-row${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(s);
              }}
            >
              <span className="scrip-dd-sym">{s.symbol}</span>
              <span className="scrip-dd-name">{s.name}</span>
              <span className={`scrip-dd-exch ${s.exchange.toLowerCase()}`}>
                {s.exchange}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" strokeLinecap="round" />
    </svg>
  );
}
