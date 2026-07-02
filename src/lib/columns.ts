// Per-table column preferences: which columns show and in what order. Persisted
// to localStorage per tableId so a user's layout survives refreshes. Powers the
// "readjust / add / remove columns" feature on the Watchlist, Portfolio and
// Screener tables (e.g. move "Since add" up next to the name for clean mobile
// screenshots).
import { useCallback, useMemo, useState } from "react";

export interface ColDef {
  key: string;
  label: string;
  locked?: boolean; // always shown, can't be hidden or reordered off (e.g. Symbol)
  defaultHidden?: boolean; // hidden until the user opts in (extra/optional columns)
  align?: "left" | "right";
}
export interface ColPrefs {
  order: string[];
  hidden: string[];
}

const storeKey = (id: string) => `taureye.cols.${id}`;

function defaults(defs: ColDef[]): ColPrefs {
  return {
    order: defs.map((d) => d.key),
    hidden: defs.filter((d) => d.defaultHidden && !d.locked).map((d) => d.key),
  };
}

export function loadColPrefs(id: string, defs: ColDef[]): ColPrefs {
  try {
    const raw = localStorage.getItem(storeKey(id));
    if (!raw) return defaults(defs);
    const p = JSON.parse(raw) as ColPrefs;
    const known = new Set(defs.map((d) => d.key));
    // keep saved order, drop unknown keys, append any newly-added columns
    const order = (p.order ?? []).filter((k) => known.has(k));
    for (const d of defs) if (!order.includes(d.key)) order.push(d.key);
    const lockedKeys = new Set(defs.filter((d) => d.locked).map((d) => d.key));
    const hidden = (p.hidden ?? []).filter((k) => known.has(k) && !lockedKeys.has(k));
    return { order, hidden };
  } catch {
    return defaults(defs);
  }
}

export function saveColPrefs(id: string, prefs: ColPrefs): void {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(prefs));
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

/** Ordered, visible column defs derived from the prefs. */
export function visibleCols(defs: ColDef[], prefs: ColPrefs): ColDef[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return prefs.order
    .map((k) => byKey.get(k))
    .filter((d): d is ColDef => !!d && !prefs.hidden.includes(d.key));
}

/** React hook: persistent column prefs + the resolved visible columns. */
export function useColumns(tableId: string, defs: ColDef[]) {
  const [prefs, setState] = useState<ColPrefs>(() => loadColPrefs(tableId, defs));
  const setPrefs = useCallback(
    (p: ColPrefs) => {
      setState(p);
      saveColPrefs(tableId, p);
    },
    [tableId],
  );
  const reset = useCallback(() => setPrefs(defaults(defs)), [defs, setPrefs]);
  const visible = useMemo(() => visibleCols(defs, prefs), [defs, prefs]);
  return { prefs, setPrefs, reset, visible };
}
