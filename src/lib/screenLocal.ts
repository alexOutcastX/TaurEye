// On-device screener — a faithful TypeScript port of the backend's run_screen
// (backend/app/screener.py). It runs over the precomputed Metrics snapshot so
// the screener filters/sorts/searches with zero network and identical results.
//
// Keep this in lock-step with run_screen: same filter ops, same AND/OR logic,
// same "missing values sink to the bottom in both sort directions" rule.

import type {
  FieldDef,
  Filter,
  Metrics,
  Operator,
  ScreenRequest,
  ScreenResponse,
} from "../api/types";

type MetricValue = number | string | null | undefined;

function valueOf(m: Metrics, key: string): MetricValue {
  return (m as unknown as Record<string, MetricValue>)[key];
}

// One comparison of a numeric metric value against an operator + operand(s).
function compare(n: number, op: Operator, a: number, b?: number | null): boolean {
  switch (op) {
    case "gt":
      return n > a;
    case "gte":
      return n >= a;
    case "lt":
      return n < a;
    case "lte":
      return n <= a;
    case "eq":
      return n === a;
    case "between": {
      const other = b ?? a;
      return Math.min(a, other) <= n && n <= Math.max(a, other);
    }
    default:
      return true;
  }
}

// Mirror screener._passes: unknown field => keep (ignored); null value can't
// satisfy a numeric comparison => drop. A filter may carry a SECOND condition on
// the same field (`join` AND/OR with `op2`/`value2`) — e.g. price >100 AND <2000,
// or RSI <30 OR >70.
function passes(m: Metrics, f: Filter, fieldKeys: Set<string>): boolean {
  if (!fieldKeys.has(f.field)) return true;
  const v = valueOf(m, f.field);
  if (v === null || v === undefined) return false;
  // Filter values are numeric; coerce the metric value so the comparison is
  // always number-vs-number. A non-numeric string yields NaN, whose ordered
  // comparisons are all false — i.e. it can't satisfy the filter, which mirrors
  // the backend dropping values that can't meet a numeric comparison.
  const n = typeof v === "number" ? v : Number(v);
  const primary = compare(n, f.op, f.value, f.value2);
  if (f.join && f.op2) {
    const secondary = compare(n, f.op2, f.value2 ?? f.value);
    return f.join === "AND" ? primary && secondary : primary || secondary;
  }
  return primary;
}

export function runScreen(
  metrics: Metrics[],
  fields: FieldDef[],
  req: ScreenRequest,
): ScreenResponse {
  const fieldKeys = new Set(fields.map((f) => f.key));
  // Sortable = the filterable fields plus the two descriptive columns.
  const sortable = new Set<string>([...fieldKeys, "symbol", "name"]);

  let rows = metrics;

  if (req.exchange) {
    rows = rows.filter((m) => m.exchange === req.exchange);
  }

  if (req.segments && req.segments.length) {
    const allowed = new Set(req.segments);
    rows = rows.filter((m) => allowed.has(m.segment || "EQ"));
  }

  if (req.query) {
    const q = req.query.trim().toUpperCase();
    rows = rows.filter(
      (m) =>
        m.symbol.toUpperCase().includes(q) ||
        m.name.toUpperCase().includes(q),
    );
  }

  if (req.filters && req.filters.length) {
    rows = rows.filter((m) => {
      const results = req.filters.map((f) => passes(m, f, fieldKeys));
      return req.logic === "AND"
        ? results.every(Boolean)
        : results.some(Boolean);
    });
  }

  const sortKey = sortable.has(req.sort_by) ? req.sort_by : "market_cap_cr";
  const reverse = req.sort_dir === "desc";

  // Comparator equivalent to Python's sorted(key=(missing!=reverse, v),
  // reverse=reverse): present rows ordered by value (asc/desc), missing last.
  const missing = (v: MetricValue) =>
    v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  const sorted = [...rows].sort((a, b) => {
    const va = valueOf(a, sortKey);
    const vb = valueOf(b, sortKey);
    const ma = missing(va);
    const mb = missing(vb);
    if (ma && mb) return 0;
    if (ma) return 1; // a missing -> after b
    if (mb) return -1; // b missing -> after a
    const cmp = va! < vb! ? -1 : va! > vb! ? 1 : 0;
    return reverse ? -cmp : cmp;
  });

  // No cap: return the full matching set (the UI paginates). `count` is the true
  // number of matches, not a page size.
  return {
    count: sorted.length,
    total_universe: metrics.length,
    results: sorted,
  };
}
