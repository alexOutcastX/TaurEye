export const fmtInt = (n: number) => n.toLocaleString("en-IN");

export const fmtNum = (n: number, dp = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export function fmtCap(cr: number | null | undefined): string {
  if (cr == null) return "—";
  if (cr >= 100000) return `₹${(cr / 100000).toFixed(2)}L cr`;
  if (cr >= 1000) return `₹${(cr / 1000).toFixed(2)}k cr`;
  return `₹${cr.toFixed(0)} cr`;
}

export const signClass = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "");

// "03 Jun 2026, 02:18 PM" — a short, readable date+time for freshness stamps.
export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
