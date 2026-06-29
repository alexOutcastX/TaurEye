import { copyToClipboard } from "./referral";

// Re-exported for back-compat: callers import `publicOrigin` from "./share".
// The implementation lives in ./origin (shared with referral/invite links).
export { publicOrigin } from "./origin";

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
