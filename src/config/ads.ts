// Ad configuration — web (Google AdSense) + native (AdMob). Everything is
// env-gated: with no IDs set, ads stay OFF and slots fall back to the dev
// placeholder. Fill these in to go live (no code change needed).
//
// Web vars are build-time (VITE_*). Set them in .env / CI:
//   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
//   VITE_ADSENSE_SLOT_SCREENER=1234567890   (an AdSense ad-unit id)
//   VITE_ADSENSE_SLOT_WALLET=0987654321
//   VITE_ADMOB_BANNER_ANDROID=ca-app-pub-XXX/YYY   (AdMob banner unit)
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();

// ---------- Web: Google AdSense ----------
export const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT ?? "").trim();

// Named in-flow slots → AdSense ad-unit ids. Add a row when you create a unit.
export const ADSENSE_SLOTS: Record<string, string> = {
  screener: (import.meta.env.VITE_ADSENSE_SLOT_SCREENER ?? "").trim(),
  wallet: (import.meta.env.VITE_ADSENSE_SLOT_WALLET ?? "").trim(),
};

/** Can a given web slot render a real AdSense unit? */
export function adsenseSlot(name?: string): string | null {
  if (isNative || !ADSENSE_CLIENT || !name) return null;
  const slot = ADSENSE_SLOTS[name];
  return slot ? slot : null;
}

// ---------- Native: AdMob ----------
export const ADMOB_BANNER_ANDROID = (import.meta.env.VITE_ADMOB_BANNER_ANDROID ?? "").trim();

/** Is AdMob configured for this native build? */
export function admobReady(): boolean {
  return isNative && ADMOB_BANNER_ANDROID !== "";
}

// ---------- AdSense script loader (web) ----------
let adsenseLoading: Promise<void> | null = null;

/** Inject the AdSense script once (idempotent). Resolves when present. */
export function ensureAdSenseScript(): Promise<void> {
  if (!ADSENSE_CLIENT || isNative) return Promise.resolve();
  if (adsenseLoading) return adsenseLoading;
  adsenseLoading = new Promise<void>((resolve) => {
    const existing = document.querySelector('script[data-taureye-adsense]');
    if (existing) return resolve();
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    s.setAttribute("data-taureye-adsense", "1");
    s.onload = () => resolve();
    s.onerror = () => resolve(); // ad blocker / offline — fail quietly
    document.head.appendChild(s);
  });
  return adsenseLoading;
}
