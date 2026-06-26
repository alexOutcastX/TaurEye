import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
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
  { to: "/app/screener", label: "Screener", icon: FilterIcon },
  { to: "/app/chart", label: "Chart", icon: ChartIcon },
  { to: "/app/indices", label: "Indices & FX", icon: GlobeIcon },
  { to: "/app/watchlist", label: "Watchlist", icon: StarIcon },
  { to: "/app/portfolio", label: "Portfolio", icon: BriefcaseIcon },
  { to: "/app/calculators", label: "Calculators", icon: CalcIcon },
  { to: "/app/saved", label: "Saved Screens", icon: BookmarkIcon },
  { to: "/app/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/app/refer", label: "Refer & Earn", icon: GiftIcon },
  { to: "/app/settings", label: "Settings", icon: GearIcon },
];

// Public content pages — shown in the hamburger drawer (mobile) below the app
// nav. They navigate out to the no-login public site (About, Insights, etc.).
const CONTENT = [
  { to: "/", label: "Home" },
  { to: "/blog", label: "Insights" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/terms", label: "Terms & Conditions" },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  // On mobile the nav collapses into a hideable left drawer; this toggles it.
  // (Desktop ignores it — the drawer styles only apply under the mobile media
  // query, so the horizontal top bar is unchanged on wide screens.)
  const [menuOpen, setMenuOpen] = useState(false);

  // Register for remote push once on native startup (no-op on web / unconfigured).
  useEffect(() => {
    void initPush((path) => nav(path));
  }, [nav]);

  // Close the drawer on Escape for keyboard/back-friendly dismissal.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    nav("/login");
  };

  return (
    <div className="shell">
      <header className="topbar">
        {/* Glossy black frame keeps the logo + wordmark + hamburger legible in
            ANY theme (the white theme otherwise washes the logo out). */}
        <div className="brand-cluster">
          {/* hamburger — visible only on mobile (CSS); toggles the left drawer */}
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MenuIcon open={menuOpen} />
          </button>

          <div className="topbar-brand">
            <Logo size={24} />
          </div>

          {/* Home + Alerts sit right next to the branding. */}
          <button
            type="button"
            className="home-btn"
            title="Home (Dashboard)"
            aria-label="Home"
            onClick={() => nav("/app/dashboard")}
          >
            <HomeIcon />
          </button>
          <AlertsBell />
        </div>

        {/* Sign out pinned to the right corner of the glossy bar (brand at left). */}
        <button type="button" className="signout-btn" onClick={handleSignOut}>
          Sign out
        </button>

        <nav className={"topnav" + (menuOpen ? " open" : "")}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                "nav-item" + (isActive ? " active" : "")
              }
              onClick={() => setMenuOpen(false)}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* Public pages — only rendered inside the mobile drawer (see CSS). */}
          <div className="nav-extra">
            <span className="nav-extra-label">More</span>
            {CONTENT.map(({ to, label }) => (
              <Link key={to} to={to} className="nav-extra-link" onClick={() => setMenuOpen(false)}>
                {label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="topbar-right">
          <ThemeToggle />
          <CreditsBadge />
          <span className="user-pill">
            <span className="avatar">{(user?.name ?? "G")[0].toUpperCase()}</span>
            {user?.name ?? "Guest"}
          </span>
        </div>

        <ScripSearch />
      </header>

      {/* Dimmed backdrop behind the mobile drawer; tap to close. Hidden on
          desktop (display:none unless the mobile query + .show apply). */}
      <button
        type="button"
        className={"nav-backdrop" + (menuOpen ? " show" : "")}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setMenuOpen(false)}
      />

      <IndexTicker />

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

/* ---- inline icons (stroke = currentColor) ---- */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
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
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.2l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" strokeLinecap="round" strokeLinejoin="round" />
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
