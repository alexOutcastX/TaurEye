import type { CapacitorConfig } from "@capacitor/cli";

// TaurEye Android wrapper.
//
// The packaged APK loads the built web app from `dist/` (webDir) and runs in
// LOCAL data mode: it reads the precomputed JSON bundle from the VM by absolute
// URL (VITE_DATA_BASE/VITE_CANDLE_BASE = http://161.118.174.177/data, set at
// build time — see .github/workflows/android.yml). There is no live /api
// backend in production.
const config: CapacitorConfig = {
  appId: "app.taureye.mobile",
  appName: "TaurEye",
  webDir: "dist",
  android: {
    // Allow http (cleartext) traffic so a LAN-IP backend works during testing.
    // For a public release point VITE_API_BASE at an https backend and you can
    // set this back to false.
    allowMixedContent: true,
  },
  server: {
    // Android needs https or cleartext explicitly allowed; keep cleartext on for
    // LAN testing. Harmless for https backends.
    cleartext: true,
  },
  plugins: {
    // Route the app's fetch/XHR through Capacitor's NATIVE HTTP layer. The app
    // reads the data bundle cross-origin (WebView origin https://localhost → the
    // VM at http://161.118.174.177), which the WebView blocks on CORS (the VM
    // sends no CORS headers) and mixed content. Native HTTP isn't subject to
    // either, so metrics/candles/indices load on-device. (The web build is
    // same-origin and unaffected.)
    CapacitorHttp: {
      enabled: true,
    },
    // Remote push (FCM). How a push is shown while the app is in the foreground.
    // Requires android/app/google-services.json (Android) to be configured.
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    // Capgo over-the-air updates. autoUpdate "onLaunch" applies a freshly
    // downloaded bundle directly at cold start (instead of the next launch), so
    // users get the update in the same session. The native splash stays up while
    // it downloads/applies and Capgo hides it automatically (autoSplashscreen)
    // when done or when no update is needed. Only the web layer updates this way
    // — native changes still require a rebuild + reinstall.
    CapacitorUpdater: {
      autoUpdate: "onLaunch",
      // Roll back to the last good bundle if the app doesn't call
      // notifyAppReady() within this window (a crashed/broken update).
      appReadyTimeout: 10000,
      // The channel CI uploads to (see .github/workflows/mobile-ota.yml).
      defaultChannel: "production",
      // Let Capgo own the splash screen during a direct update.
      autoSplashscreen: true,
      // Native loading indicator over the splash while the bundle downloads.
      autoSplashscreenLoader: true,
      // Safety net: if the update can't be fetched in time, dismiss the splash
      // and let the bundle install on the next background/launch instead.
      autoSplashscreenTimeout: 15000,
    },
    // Required for autoSplashscreen: Capgo controls when the splash hides.
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0a0c0f",
      androidSpinnerStyle: "large",
      spinnerColor: "#18c98c",
    },
  },
};

export default config;
