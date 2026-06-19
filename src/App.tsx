import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "./auth/AuthContext";
import { storeRefCode } from "./lib/referral";
import AppShell from "./app/AppShell";
import BootGate from "./components/BootGate";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Legal from "./pages/Legal";
import Login from "./pages/Login";
import Screener from "./pages/Screener";
import Chart from "./pages/Chart";
import GlobalIndices from "./pages/GlobalIndices";
import Alerts from "./pages/Alerts";
import Watchlist from "./pages/Watchlist";
import Saved from "./pages/Saved";
import Wallet from "./pages/Wallet";
import Portfolio from "./pages/Portfolio";
import Calculators from "./pages/Calculators";
import Refer from "./pages/Refer";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ConsentBanner from "./components/ConsentBanner";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed, loading } = useAuth();
  // Wait for the (cloud) session to hydrate before deciding — otherwise a
  // signed-in user is bounced to /login on every refresh while the async
  // Supabase session is still resolving.
  if (loading) return null;
  return isAuthed ? <>{children}</> : <Navigate to="/" replace />;
}

// Clean invite link: /i/<code> stashes the referral code, then lands on the home
// page where the visitor can sign up (the code is redeemed after their first
// sign-in). Much tidier to share than /login?ref=<code>.
function Invite() {
  const { code } = useParams();
  useEffect(() => {
    if (code) storeRefCode(code);
  }, [code]);
  return <Navigate to="/" replace />;
}

export default function App() {
  // The native app opens straight to a clean, mobile-friendly sign-in screen
  // (branding in the card, blank background, no marketing graphics). The
  // full marketing Landing is web-only. Evaluated at render time so Capacitor
  // is initialised on-device.
  const native = Capacitor.isNativePlatform();
  return (
    <>
      <ConsentBanner />
      <Routes>
      <Route path="/" element={native ? <Login /> : <Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/i/:code" element={<Invite />} />
      <Route path="/legal/:doc" element={<Legal />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <BootGate>
              <AppShell />
            </BootGate>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="screener" element={<Screener />} />
        <Route path="chart" element={<Chart />} />
        <Route path="indices" element={<GlobalIndices />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="calculators" element={<Calculators />} />
        <Route path="saved" element={<Saved />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="refer" element={<Refer />} />
        <Route path="settings" element={<Settings />} />
      </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
