import { useEffect, useState } from "react";
import { ExportMenu } from "./TableTools";
import type { ExportColumn } from "../lib/exporters";
import { fmtNum } from "../lib/format";
import { getFxRates, convert, type FxRates } from "../lib/fx";
import type { FuelData, FuelCityRow, FuelCountryRow } from "../lib/fuelData";

type Row = Record<string, unknown>;

const IN_COLS: { key: keyof FuelCityRow; label: string; align: "left" | "right" }[] = [
  { key: "city", label: "City", align: "left" },
  { key: "state", label: "State", align: "left" },
  { key: "petrol", label: "Petrol ₹/L", align: "right" },
  { key: "premium_petrol", label: "Premium ₹/L", align: "right" },
  { key: "diesel", label: "Diesel ₹/L", align: "right" },
  { key: "cng", label: "CNG ₹/kg", align: "right" },
  { key: "lpg", label: "LPG ₹/cyl", align: "right" },
];
// Global prices are scraped in USD/litre; we convert them to ₹ at the live rate.
const GL_COLS_INR: { key: keyof FuelCountryRow; label: string; align: "left" | "right" }[] = [
  { key: "country", label: "Country", align: "left" },
  { key: "petrol", label: "Petrol ₹/L", align: "right" },
  { key: "diesel", label: "Diesel ₹/L", align: "right" },
];
// Fallback columns when live FX is unavailable — show the raw USD figures.
const GL_COLS_USD: { key: keyof FuelCountryRow; label: string; align: "left" | "right" }[] = [
  { key: "country", label: "Country", align: "left" },
  { key: "petrol", label: "Petrol $/L", align: "right" },
  { key: "diesel", label: "Diesel $/L", align: "right" },
];

const cell = (v: unknown): string => {
  if (v == null || v === "") return "—";
  return typeof v === "number" ? fmtNum(v) : String(v);
};

// Keep only columns that carry at least one value (plus the always-on first two).
function usedCols<T extends { key: string; align: "left" | "right" }>(cols: T[], rows: Row[], keep: number): T[] {
  return cols.filter((c, i) => i < keep || rows.some((r) => r[c.key] != null && r[c.key] !== ""));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function Table({
  title,
  cols,
  rows,
  filename,
  subtitle,
}: {
  title: string;
  cols: { key: string; label: string; align: "left" | "right" }[];
  rows: Row[];
  filename: string;
  subtitle: string;
}) {
  const exportCols: ExportColumn[] = cols.map((c) => ({ key: c.key, label: c.label, align: c.align }));
  const exportRows = rows.map((r) => {
    const o: Record<string, string> = {};
    for (const c of cols) o[c.key] = cell(r[c.key]) === "—" ? "" : cell(r[c.key]);
    return o;
  });
  return (
    <div className="fuel-card">
      <div className="fuel-card-head">
        <h2 className="fuel-title">{title}</h2>
        <ExportMenu
          filename={filename}
          title={title}
          subtitle={subtitle}
          getData={() => ({ columns: exportCols, rows: exportRows })}
        />
      </div>
      <div className="table-wrap">
        <table className="fuel-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.align === "left" ? "left" : ""}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "mono" : c.key === "city" || c.key === "country" ? "left strong" : "left dim"}>
                    {cell(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FuelPanel({ data }: { data: FuelData | null }) {
  // Live USD→INR so the global table shows ₹ (the bundle stores it in USD).
  const [fx, setFx] = useState<FxRates | null>(null);
  useEffect(() => {
    let alive = true;
    void getFxRates().then((r) => {
      if (alive) setFx(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!data || (!data.india.length && !data.global.length)) {
    return <p className="gidx-empty">Fuel prices will appear after the next data refresh.</p>;
  }

  const usdToInr = fx?.rates.INR ?? null;
  const inRows = data.india as unknown as Row[];

  // Convert each global row's USD prices to INR (fall back to raw USD if FX
  // is unavailable). LPG is always null for global, so it drops out via usedCols.
  const glRows: Row[] = data.global.map((r) => {
    if (usdToInr && r.currency === "USD") {
      const c = (v: number | null | undefined) =>
        v != null ? (convert(fx!, v, "USD", "INR") ?? null) : null;
      const p = c(r.petrol);
      const d = c(r.diesel);
      return {
        ...r,
        petrol: p != null ? round2(p) : null,
        diesel: d != null ? round2(d) : null,
      };
    }
    return r as unknown as Row;
  });

  const inCols = usedCols(IN_COLS as unknown as { key: string; label: string; align: "left" | "right" }[], inRows, 2);
  const glCols = usedCols(
    (usdToInr ? GL_COLS_INR : GL_COLS_USD) as unknown as { key: string; label: string; align: "left" | "right" }[],
    glRows,
    1,
  );
  const asOf = data.meta?.data_date ? ` · ${data.meta.data_date}` : "";

  return (
    <div className="fuel-wrap">
      {inRows.length > 0 && (
        <Table
          title="India — city fuel prices"
          cols={inCols}
          rows={inRows}
          filename="taureye-fuel-india"
          subtitle={`${inRows.length} cities${asOf}`}
        />
      )}
      {glRows.length > 0 && (
        <Table
          title="Global — fuel prices (₹)"
          cols={glCols}
          rows={glRows}
          filename="taureye-fuel-global"
          subtitle={
            usdToInr
              ? `${glRows.length} countries · ₹${fmtNum(round2(usdToInr))}/USD${asOf}`
              : `${glRows.length} countries · USD${asOf}`
          }
        />
      )}
      <p className="fuel-note">
        Indicative daily retail fuel prices for information only. Sourced from public aggregators, may be delayed or
        differ from pump prices; verify locally.{" "}
        {usdToInr
          ? `Global prices converted from USD to ₹ at the live rate (₹${fmtNum(round2(usdToInr))} per USD). `
          : "Global prices are shown in USD (live FX unavailable). "}
        {data.meta?.source_india && `India: ${data.meta.source_india}. `}
        {data.meta?.source_global && `Global: ${data.meta.source_global}.`}
      </p>
    </div>
  );
}
