import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext";
import { initOta } from "./lib/ota";
import { initAdMob, showBanner } from "./lib/ads";
import { applyTheme, getTheme } from "./lib/theme";

// Apply the saved light/dark theme before first paint (avoids a flash).
applyTheme(getTheme());

// Capgo over-the-air updates (native only). With autoUpdate on, the plugin
// downloads a new web bundle in the background and swaps it in on the next
// launch — so code ships to phones without rebuilding the APK. We must call
// notifyAppReady() once booted, otherwise Capgo assumes the update is broken
// and rolls back to the last good bundle. No-op on the web build.
if (Capacitor.isNativePlatform()) {
  // Register OTA listeners FIRST so the loading screen can show download
  // progress, then tell Capgo the bundle booted cleanly.
  initOta();
  CapacitorUpdater.notifyAppReady().catch(() => {
    /* updater unavailable — keep running on the current bundle */
  });
  // AdMob banner (no-op unless VITE_ADMOB_BANNER_ANDROID is set + plugin synced).
  initAdMob().then(showBanner);

  // OAuth deep-link return (social login): the provider redirects to
  // app.taureye.mobile://auth-callback?code=...; exchange it for a session and
  // close the in-app browser. AuthContext's onAuthStateChange picks it up.
  import("@capacitor/app").then(({ App: CapApp }) => {
    CapApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith("app.taureye.mobile://auth-callback")) return;
      try {
        const code = new URL(url.replace("app.taureye.mobile://", "https://x/")).searchParams.get("code");
        if (code) {
          const { supabase } = await import("./lib/supabase");
          await supabase?.auth.exchangeCodeForSession(code);
        }
      } finally {
        const { Browser } = await import("@capacitor/browser");
        Browser.close().catch(() => {});
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
