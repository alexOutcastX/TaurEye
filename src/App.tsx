import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import AppShell from "./app/AppShell";
import BootGate from "./components/BootGate";
import Login from "./pages/Login";
import Screener from "./pages/Screener";
import Chart from "./pages/Chart";
import Watchlist from "./pages/Watchlist";
import Saved from "./pages/Saved";
import Wallet from "./pages/Wallet";
import Refer from "./pages/Refer";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

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
        <Route index element={<Navigate to="screener" replace />} />
        <Route path="screener" element={<Screener />} />
        <Route path="chart" element={<Chart />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="saved" element={<Saved />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="refer" element={<Refer />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
