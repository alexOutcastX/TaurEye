// Daily fuel prices published by the nightly data engine as /data/fuel.json.
// India = per-city petrol/premium/diesel/CNG/LPG; Global = per-country
// petrol/diesel/LPG. Fully client-side read (fits the static hosting model);
// fail-soft to null so the tab shows a "coming after next refresh" message
// until the first export runs.

import { dataUrl, bundledUrl } from "../data/source";

export interface FuelCityRow {
  city: string;
  state?: string | null;
  petrol?: number | null;
  premium_petrol?: number | null; // XP95 / Speed / Power etc.
  diesel?: number | null;
  cng?: number | null; // ₹/kg
  lpg?: number | null; // ₹ per 14.2kg cylinder
}

export interface FuelCountryRow {
  country: string;
  petrol?: number | null;
  diesel?: number | null;
  lpg?: number | null;
  currency?: string | null; // e.g. "USD"
  unit?: string | null; // e.g. "litre"
}

export interface FuelData {
  meta?: {
    generated_at?: string | null;
    data_date?: string | null;
    source_india?: string | null;
    source_global?: string | null;
  };
  india: FuelCityRow[];
  global: FuelCountryRow[];
}

async function tryFetch(url: string): Promise<FuelData | null> {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return null;
    const j = (await r.json()) as FuelData;
    if (!Array.isArray(j.india) && !Array.isArray(j.global)) return null;
    return { meta: j.meta, india: j.india ?? [], global: j.global ?? [] };
  } catch {
    return null;
  }
}

/** Read the published fuel bundle (remote host first, then the in-app copy). */
export async function fetchFuel(): Promise<FuelData | null> {
  return (await tryFetch(dataUrl("fuel.json"))) ?? (await tryFetch(bundledUrl("fuel.json")));
}
