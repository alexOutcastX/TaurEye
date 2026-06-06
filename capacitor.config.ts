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
    // Capgo over-the-air updates. autoUpdate pulls the latest bundle from the
    // configured channel in the background and applies it on the next launch,
    // so web/code changes reach installed apps without a Play Store / APK
    // rebuild. Only the web layer updates this way — native changes (new
    // plugins, this config, permissions) still require a rebuild + reinstall.
    CapacitorUpdater: {
      autoUpdate: true,
      // Roll back to the last good bundle if the app doesn't call
      // notifyAppReady() within this window (a crashed/broken update).
      appReadyTimeout: 10000,
      // The channel CI uploads to (see .github/workflows/mobile-ota.yml).
      defaultChannel: "production",
    },
  },
};

export default config;
