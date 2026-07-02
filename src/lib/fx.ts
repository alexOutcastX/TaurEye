// Live currency rates from a free, no-key public API. Works in the browser
// (CORS-enabled) and in the app (via CapacitorHttp). Rates are USD-based and
// refresh daily; we cache for 30 minutes and fall back across sources so the UI
// degrades gracefully. This is what makes the Currency tab + converter update
// (the static /data bundle only changes on the nightly refresh).

export interface FxRates {
  base: string; // always "USD"
  rates: Record<string, number>; // units of currency per 1 USD
  updated: string | null; // source's last-update label
}

const TTL = 30 * 60 * 1000; // 30 minutes
let cache: { at: number; data: FxRates } | null = null;
let inflight: Promise<FxRates | null> | null = null;

async function fromErApi(): Promise<FxRates> {
  const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  const j = await r.json();
  if (j?.result !== "success" || !j?.rates?.INR) throw new Error("er-api");
  return { base: "USD", rates: j.rates as Record<string, number>, updated: j.time_last_update_utc ?? null };
}

async function fromFrankfurter(): Promise<FxRates> {
  const r = await fetch("https://api.frankfurter.app/latest?from=USD");
  const j = await r.json();
  if (!j?.rates?.INR) throw new Error("frankfurter");
  return { base: "USD", rates: { USD: 1, ...(j.rates as Record<string, number>) }, updated: j.date ?? null };
}

/** Fetch (or return cached) USD-based rates. Returns null only if every source fails. */
export async function getFxRates(force = false): Promise<FxRates | null> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    for (const src of [fromErApi, fromFrankfurter]) {
      try {
        const data = await src();
        cache = { at: Date.now(), data };
        return data;
      } catch {
        /* try the next source */
      }
    }
    return cache?.data ?? null; // keep last-good rates if a later refresh fails
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Convert `amount` from one currency to another using USD-based rates. */
export function convert(rates: FxRates, amount: number, from: string, to: string): number | null {
  const rf = rates.rates[from];
  const rt = rates.rates[to];
  if (!rf || !rt || !Number.isFinite(amount)) return null;
  return (amount / rf) * rt; // from → USD → to
}

export interface Ccy {
  code: string;
  name: string;
}

// Common currencies offered in the converter (subset of what the API returns).
export const CURRENCIES: Ccy[] = [
  { code: "USD", name: "US Dollar" },
  { code: "INR", name: "Indian Rupee" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "ZAR", name: "South African Rand" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "KRW", name: "South Korean Won" },
];

// Pairs shown on the Currency tab — mostly vs INR, plus a few majors.
export const FX_PAIRS: [string, string][] = [
  ["USD", "INR"], ["EUR", "INR"], ["GBP", "INR"], ["JPY", "INR"], ["AED", "INR"],
  ["AUD", "INR"], ["CAD", "INR"], ["CHF", "INR"], ["CNY", "INR"], ["SGD", "INR"],
  ["SAR", "INR"], ["HKD", "INR"], ["EUR", "USD"], ["GBP", "USD"], ["USD", "JPY"],
];
