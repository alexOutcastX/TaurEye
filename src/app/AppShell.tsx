import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { initPush } from "../lib/push";
import Logo from "../components/Logo";
import ScripSearch from "../components/ScripSearch";
import IndexTicker from "../components/IndexTicker";
import CreditsBadge from "../components/CreditsBadge";
import ThemeToggle from "../components/ThemeToggle";
import AlertsBell from "../components/AlertsBell";
import "./AppShell.css";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: GridIcon },
  { to: "/app/screener", label: "Screener", icon: FilterIcon },
  { to: "/app/chart", label: "Chart", icon: ChartIcon },
  { to: "/app/indices", label: "Indices", icon: GlobeIcon },
  { to: "/app/watchlist", label: "Watchlist", icon: StarIcon },
  { to: "/app/portfolio", label: "Portfolio", icon: BriefcaseIcon },
  { to: "/app/calculators", label: "Calculators", icon: CalcIcon },
  { to: "/app/saved", label: "Saved Screens", icon: BookmarkIcon },
  { to: "/app/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/app/refer", label: "Refer & Earn", icon: GiftIcon },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();

  // Register for remote push once on native startup (no-op on web / unconfigured).
  useEffect(() => {
    void initPush((path) => nav(path));
  }, [nav]);

  const handleSignOut = () => {
    signOut();
    nav("/login");
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <Logo size={24} />
        </div>

        <nav className="topnav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                "nav-item" + (isActive ? " active" : "")
              }
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <AlertsBell />
          <ThemeToggle />
          <CreditsBadge />
          <span className="user-pill">
            <span className="avatar">{(user?.name ?? "G")[0].toUpperCase()}</span>
            {user?.name ?? "Guest"}
          </span>
          <button className="link-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <ScripSearch />
      </header>

      <IndexTicker />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

/* ---- inline icons (stroke = currentColor) ---- */
function CalcIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h0M12 11h0M16 11h0M8 15h0M12 15h0M16 15v4M8 19h4" strokeLinecap="round" />
    </svg>
  );
}
function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" strokeLinecap="round" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" strokeLinecap="round" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z" strokeLinejoin="round" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 4h10v16l-5-3-5 3V4Z" strokeLinejoin="round" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
      <path d="M3 7l2-3h11l1 3M16 13h2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 11h16v9H4zM4 7h16v4H4zM12 7v13" strokeLinejoin="round" />
      <path d="M12 7S10.5 4 8.5 4 6 6 8 7h4Zm0 0s1.5-3 3.5-3S18 6 16 7h-4Z" strokeLinejoin="round" />
    </svg>
  );
}
