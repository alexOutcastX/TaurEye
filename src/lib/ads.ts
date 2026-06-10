// Native AdMob banner control. The plugin is dynamically imported so it stays
// out of the web bundle and only loads on a native (APK) build. Everything is a
// no-op unless AdMob is configured (VITE_ADMOB_BANNER_ANDROID) and we're native.
//
// NATIVE CHANGE: adding this plugin needs a one-time `cap sync` + APK rebuild
// (and your AdMob app id in android config). Web/OTA updates alone won't enable
// native ads. See MONETIZATION-SETUP.md.
import { ADMOB_BANNER_ANDROID, admobReady } from "../config/ads";
import { adsDisabled } from "./economy";

let started = false;

/** Initialize the AdMob SDK (call once on native boot). */
export async function initAdMob(): Promise<void> {
  if (!admobReady()) return;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.initialize();
  } catch {
    /* plugin missing / not synced — ignore, app still runs */
  }
}

/** Show the bottom banner (unless the user owns the no-ad pack). */
export async function showBanner(): Promise<void> {
  if (!admobReady() || adsDisabled()) return;
  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await import(
      "@capacitor-community/admob"
    );
    await AdMob.showBanner({
      adId: ADMOB_BANNER_ANDROID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    });
    started = true;
  } catch {
    /* ignore banner failures */
  }
}

/** Remove the banner (e.g. after the user buys the no-ad pack). */
export async function hideBanner(): Promise<void> {
  if (!started) return;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.hideBanner();
    await AdMob.removeBanner();
    started = false;
  } catch {
    /* ignore */
  }
}
