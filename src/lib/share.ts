import { copyToClipboard } from "./referral";

/**
 * The PUBLIC site origin for share links. A shared link must point at the live
 * website, NOT wherever the code runs — inside the APK's WebView
 * `window.location.origin` is `localhost`/`capacitor://…`. Resolve, in order:
 * VITE_PUBLIC_URL → the origin of an absolute VITE_DATA_BASE (mobile build) → a
 * real non-localhost https origin → the canonical domain.
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

/**
 * Share a link via the best available channel: the native OS share sheet on the
 * app (Capacitor), the Web Share API in mobile browsers, else copy to clipboard.
 * Returns how it was handled so the caller can show the right confirmation.
 */
export async function shareLink(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied" | "failed"> {
  const { title, text, url } = opts;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    }
  } catch {
    /* fall through to web sharing */
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "shared"; // user dismissed
      // otherwise fall back to clipboard
    }
  }

  const r = await copyToClipboard(`${text}\n${url}`);
  return r === "copied" ? "copied" : "failed";
}
