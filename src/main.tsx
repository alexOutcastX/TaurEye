import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext";

// Capgo over-the-air updates (native only). With autoUpdate on, the plugin
// downloads a new web bundle in the background and swaps it in on the next
// launch — so code ships to phones without rebuilding the APK. We must call
// notifyAppReady() once booted, otherwise Capgo assumes the update is broken
// and rolls back to the last good bundle. No-op on the web build.
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch(() => {
    /* updater unavailable — keep running on the current bundle */
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
