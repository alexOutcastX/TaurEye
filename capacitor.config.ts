import type { CapacitorConfig } from "@capacitor/cli";

// TaurEye Android wrapper.
//
// The packaged APK loads the built web app from `dist/` (webDir). There is no
// Vite dev-proxy on the device, so the React app must reach the backend by an
// absolute URL — set VITE_API_BASE at build time (a LAN IP like
// http://192.168.1.20:8010 while testing, or a hosted https URL for release)
// before running `npm run build`. See src/api/client.ts.
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
