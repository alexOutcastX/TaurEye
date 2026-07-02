import { ExportMenu } from "./TableTools";
import type { ExportColumn } from "../lib/exporters";
import { fmtNum } from "../lib/format";
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
const GL_COLS: { key: keyof FuelCountryRow; label: string; align: "left" | "right" }[] = [
  { key: "country", label: "Country", align: "left" },
  { key: "petrol", label: "Petrol", align: "right" },
  { key: "diesel", label: "Diesel", align: "right" },
  { key: "lpg", label: "LPG", align: "right" },
  { key: "unit", label: "Unit", align: "left" },
];

const cell = (v: unknown): string => {
  if (v == null || v === "") return "—";
  return typeof v === "number" ? fmtNum(v) : String(v);
};

// Keep only columns that carry at least one value (plus the always-on first two).
function usedCols<T extends { key: string; align: "left" | "right" }>(cols: T[], rows: Row[], keep: number): T[] {
  return cols.filter((c, i) => i < keep || rows.some((r) => r[c.key] != null && r[c.key] !== ""));
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
  if (!data || (!data.india.length && !data.global.length)) {
    return <p className="gidx-empty">Fuel prices will appear after the next data refresh.</p>;
  }
  const inRows = data.india as unknown as Row[];
  const glRows = data.global as unknown as Row[];
  const inCols = usedCols(IN_COLS as unknown as { key: string; label: string; align: "left" | "right" }[], inRows, 2);
  const glCols = usedCols(GL_COLS as unknown as { key: string; label: string; align: "left" | "right" }[], glRows, 1);
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
          title="Global — fuel prices"
          cols={glCols}
          rows={glRows}
          filename="taureye-fuel-global"
          subtitle={`${glRows.length} countries${asOf}`}
        />
      )}
      <p className="fuel-note">
        Indicative daily retail fuel prices for information only. Sourced from public aggregators, may be delayed or
        differ from pump prices; verify locally. {data.meta?.source_india && `India: ${data.meta.source_india}. `}
        {data.meta?.source_global && `Global: ${data.meta.source_global}.`}
      </p>
    </div>
  );
}
