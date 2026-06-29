/**
 * The PUBLIC site origin for links that must point at the live website, NOT
 * wherever the code runs — inside the APK's WebView `window.location.origin` is
 * `localhost`/`capacitor://…`. Resolve, in order: VITE_PUBLIC_URL → the origin
 * of an absolute VITE_DATA_BASE (mobile build) → a real non-localhost https
 * origin → the canonical domain.
 *
 * Shared by share links (src/lib/share.ts) and referral/invite links
 * (src/lib/referral.ts) so both resolve identically.
 */
export function publicOrigin(): string {
  const explicit = (import.meta.env.VITE_PUBLIC_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const dataBase = (import.meta.env.VITE_DATA_BASE ?? "").trim();
  if (/^https?:\/\//i.test(dataBase)) {
    try {
      return new URL(dataBase).origin;
    } catch {
      /* fall through */
    }
  }

  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (/^https?:\/\//i.test(o) && !/(localhost|127\.0\.0\.1|capacitor)/i.test(o)) return o;
  }

  return "https://taureye.com";
}
