// Remote push (FCM) — Strategy A: broadcast topic.
//
// On native we request permission and subscribe to the "eod" topic, so the
// nightly cron can broadcast one message (e.g. "EOD data updated") to every
// device without a token database. Tapping a push deep-links to the relevant
// chart when the payload carries a `symbol`.
//
// The Capgo/Firebase plugin is dynamically imported on native only, so the
// Firebase JS SDK never bloats the web bundle. Fully fail-soft: an APK built
// without google-services.json (e.g. CI) simply does nothing here.

import { Capacitor } from "@capacitor/core";

export const PUSH_TOPIC = "eod";
const TOKEN_KEY = "taureye.fcm.token";

/** The device's FCM token (for direct test sends). Captured during initPush. */
export function getPushToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function initPush(navigate: (path: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== "granted") return;

    await FirebaseMessaging.subscribeToTopic({ topic: PUSH_TOPIC });

    // Capture the device token so we can do a direct (non-topic) test send.
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* token unavailable */
    }

    await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
      const data = (event?.notification?.data ?? {}) as Record<string, unknown>;
      const symbol = data.symbol;
      if (typeof symbol === "string" && symbol) {
        navigate(`/app/chart?symbol=${encodeURIComponent(symbol)}`);
      }
    });
  } catch {
    // Firebase not configured (no google-services.json) or push unavailable —
    // ignore so the app runs normally.
  }
}
