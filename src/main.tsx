import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./auth/AuthContext";
import { initOta } from "./lib/ota";
import { initAdMob, showBanner } from "./lib/ads";
import { applyTheme, getTheme } from "./lib/theme";
import { applySettings } from "./lib/settings";

// Apply the saved light/dark theme before first paint (avoids a flash), then
// layer any saved colour overrides (screener scrip colour, gains/losses, accent)
// on top — unset values fall back to the theme default.
applyTheme(getTheme());
applySettings();

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

// App-wide safety net: any uncaught render error shows a recoverable message
// instead of a blank screen (critical on the native WebView, where a white
// screen reads as a crash).
const Fallback = (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", color: "#e7eaef", background: "#0a0c0f" }}>
    <h1 style={{ fontSize: 18, margin: 0 }}>Something went wrong</h1>
    <p style={{ fontSize: 14, color: "#9aa4b2", margin: 0 }}>The app hit an unexpected error. Please reload.</p>
    <button
      onClick={() => window.location.reload()}
      style={{ background: "#18c98c", color: "#04130d", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600 }}
    >
      Reload
    </button>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={Fallback}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
