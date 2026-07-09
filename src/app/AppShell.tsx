import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { initPush } from "../lib/push";
import TopBar from "../components/TopBar";
import IndexTicker from "../components/IndexTicker";
import Disclaimer from "../components/Disclaimer";
import "./AppShell.css";

export default function AppShell() {
  const nav = useNavigate();

  // Register for remote push once on native startup (no-op on web / unconfigured).
  useEffect(() => {
    void initPush((path) => nav(path));
  }, [nav]);

  return (
    <div className="shell">
      <TopBar />
      <IndexTicker />
      <main className="content">
        <Outlet />
      </main>
      <Disclaimer />
    </div>
  );
}
