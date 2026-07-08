import { useEffect, useRef, useState } from "react";
import type { ColDef, ColPrefs } from "../lib/columns";
import { exportCsv, exportPdf, exportXlsx, type ExportColumn, type ExportRow } from "../lib/exporters";
import { track } from "../lib/analytics";
import "./TableTools.css";

/**
 * "Columns" popover — toggle visibility and reorder (▲▼) the table's columns.
 * Locked columns (e.g. Symbol) stay put. Choices persist via the parent's prefs.
 */
export function ColumnMenu({
  defs,
  prefs,
  onChange,
  onReset,
}: {
  defs: ColDef[];
  prefs: ColPrefs;
  onChange: (p: ColPrefs) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byKey = new Map(defs.map((d) => [d.key, d]));
  const ordered = prefs.order.map((k) => byKey.get(k)).filter((d): d is ColDef => !!d);
  const shownCount = ordered.filter((d) => !prefs.hidden.includes(d.key)).length;

  const toggle = (key: string) => {
    const d = byKey.get(key);
    if (d?.locked) return;
    const hidden = prefs.hidden.includes(key)
      ? prefs.hidden.filter((k) => k !== key)
      : [...prefs.hidden, key];
    onChange({ ...prefs, hidden });
  };
  const move = (key: string, dir: -1 | 1) => {
    const order = [...prefs.order];
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ ...prefs, order });
  };

  return (
    <div className="tt-wrap" ref={ref}>
      <button type="button" className="tt-btn" onClick={() => setOpen((v) => !v)} title="Show, hide and reorder columns">
        ⚙ Columns <span className="tt-count">{shownCount}</span>
      </button>
      {open && (
        <div className="tt-pop" role="menu">
          <div className="tt-pop-head">
            <span>Columns</span>
            <button type="button" className="tt-reset" onClick={onReset}>
              Reset
            </button>
          </div>
          <ul className="tt-list">
            {ordered.map((d, i) => {
              const visible = !prefs.hidden.includes(d.key);
              return (
                <li key={d.key} className="tt-row">
                  <label className="tt-check">
                    <input type="checkbox" checked={visible} disabled={d.locked} onChange={() => toggle(d.key)} />
                    <span>{d.label}</span>
                    {d.locked && <em className="tt-lock">fixed</em>}
                  </label>
                  <span className="tt-moves">
                    <button type="button" onClick={() => move(d.key, -1)} disabled={i === 0} aria-label={`Move ${d.label} up`}>▲</button>
                    <button type="button" onClick={() => move(d.key, 1)} disabled={i === ordered.length - 1} aria-label={`Move ${d.label} down`}>▼</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * "Export" popover — CSV, Excel (.xlsx) and a branded A4 PDF. Data is pulled
 * fresh on click via getData() so it reflects the current filters/columns.
 */
export function ExportMenu({
  title,
  subtitle,
  filename,
  getData,
}: {
  title: string;
  subtitle?: string;
  filename: string;
  getData: () => { columns: ExportColumn[]; rows: ExportRow[] };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (fmt: "csv" | "xlsx" | "pdf") => {
    const { columns, rows } = getData();
    if (!rows.length) {
      setOpen(false);
      return;
    }
    setBusy(true);
    track("export", { format: fmt, table: filename, rows: rows.length });
    try {
      if (fmt === "csv") exportCsv(filename, columns, rows);
      else if (fmt === "xlsx") await exportXlsx(filename, columns, rows, title.slice(0, 28));
      else await exportPdf({ filename, title, subtitle, columns, rows });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="tt-wrap" ref={ref}>
      <button type="button" className="tt-btn" onClick={() => setOpen((v) => !v)} disabled={busy} title="Export this table">
        {busy ? "Exporting…" : "⬇ Export"}
      </button>
      {open && (
        <div className="tt-pop tt-pop-export" role="menu">
          <button type="button" className="tt-item" onClick={() => run("csv")}>CSV (.csv)</button>
          <button type="button" className="tt-item" onClick={() => run("xlsx")}>Excel (.xlsx)</button>
          <button type="button" className="tt-item" onClick={() => run("pdf")}>PDF (A4, branded)</button>
        </div>
      )}
    </div>
  );
}
