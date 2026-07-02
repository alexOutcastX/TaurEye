// Shared table exporters used by the Watchlist, Portfolio and Screener:
//   - CSV   (opens in Excel; zero dependencies)
//   - XLSX  (real Excel workbook; SheetJS, lazy-loaded)
//   - PDF   (branded, print-quality A4 with 0.25in margins; jsPDF, lazy-loaded)
//
// Callers pass display strings (so CSV/PDF match the on-screen table exactly);
// the XLSX path coerces plain-numeric strings back to numbers so Excel can sort.

export interface ExportColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}
export type ExportRow = Record<string, string>;

const A4 = { w: 595.28, h: 841.89 }; // points
const MARGIN = 18; // 0.25 inch = 18pt

function stamp(): string {
  return new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "export";
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// A numeric-looking string (handles Indian grouping, ₹, %, +/-) → number.
function coerce(v: string): string | number {
  const t = String(v).replace(/[₹,\s%]/g, "");
  if (t && /^[+-]?\d*\.?\d+$/.test(t)) return Number(t);
  return v;
}

// ---- CSV ----
export function exportCsv(filename: string, columns: ExportColumn[], rows: ExportRow[]): void {
  const esc = (s: string) => {
    const v = s ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [
    columns.map((c) => esc(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => esc(r[c.key] ?? "")).join(",")),
  ];
  // Prepend a BOM so Excel reads UTF-8 (₹, en-dashes) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  download(blob, `${safeName(filename)}.csv`);
}

// ---- XLSX (SheetJS, lazy) ----
export async function exportXlsx(
  filename: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  sheetName = "Sheet1",
): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => coerce(r[c.key] ?? ""))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // sensible column widths from the longest cell in each column
  ws["!cols"] = columns.map((c) => {
    const max = Math.max(c.label.length, ...rows.map((r) => (r[c.key] ?? "").length));
    return { wch: Math.min(40, Math.max(8, max + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${safeName(filename)}.xlsx`);
}

// ---- PDF (jsPDF + autotable, lazy) ----
export async function exportPdf(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoModule = await import("jspdf-autotable");
  const autoTable = (autoModule.default ?? (autoModule as unknown as { autoTable: unknown }).autoTable) as (
    doc: unknown,
    o: unknown,
  ) => void;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const title = opts.title;
  const subtitle = opts.subtitle ?? "";
  const generated = `Generated ${stamp()}`;

  const drawChrome = (data: { pageNumber: number }) => {
    // ---- header (within the 0.25in top margin) ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(15, 20, 25);
    doc.text("TaurEye", MARGIN, MARGIN + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 96, 110);
    doc.text("EOD stock screener · taureye.com", MARGIN, MARGIN + 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 20, 25);
    doc.text(title, A4.w - MARGIN, MARGIN + 11, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 96, 110);
    if (subtitle) doc.text(subtitle, A4.w - MARGIN, MARGIN + 21, { align: "right" });
    doc.text(generated, A4.w - MARGIN, MARGIN + (subtitle ? 30 : 21), { align: "right" });

    doc.setDrawColor(15, 20, 25);
    doc.setLineWidth(1);
    doc.line(MARGIN, MARGIN + 36, A4.w - MARGIN, MARGIN + 36);

    // ---- footer (disclaimer, within the 0.25in bottom margin) ----
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(120, 128, 140);
    doc.text(
      "Educational & informational only — not investment advice. End-of-day figures may be delayed; verify with NSE/BSE.",
      MARGIN,
      A4.h - MARGIN + 2,
      { maxWidth: A4.w - 2 * MARGIN - 60 },
    );
    void data;
  };

  const rightCols: Record<number, { halign: "right" }> = {};
  opts.columns.forEach((c, i) => {
    if (c.align === "right") rightCols[i] = { halign: "right" };
  });

  autoTable(doc, {
    head: [opts.columns.map((c) => c.label)],
    body: opts.rows.map((r) => opts.columns.map((c) => r[c.key] ?? "")),
    startY: MARGIN + 46,
    margin: { top: MARGIN + 46, left: MARGIN, right: MARGIN, bottom: MARGIN + 16 },
    tableWidth: "auto",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
      lineColor: [223, 227, 232],
      lineWidth: 0.5,
      textColor: [20, 26, 34],
    },
    headStyles: { fillColor: [15, 20, 25], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 249] },
    columnStyles: rightCols,
    didDrawPage: drawChrome,
  });

  // page X of Y in the footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(120, 128, 140);
    doc.text(`Page ${i} of ${total}`, A4.w - MARGIN, A4.h - MARGIN + 2, { align: "right" });
  }

  doc.save(`${safeName(opts.filename)}.pdf`);
}
