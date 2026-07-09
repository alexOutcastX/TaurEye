import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LEGAL_DOCS } from "../config/legal";
import Logo from "./Logo";
import ScripSearch from "./ScripSearch";
import CreditsBadge from "./CreditsBadge";
import ThemeToggle from "./ThemeToggle";
import AlertsBell from "./AlertsBell";
import "../app/AppShell.css";

// The app navigation (logged-in).
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
// nav when logged in, and as the primary nav when logged out.
const CONTENT = [
  { to: "/", label: "Home" },
  { to: "/tutorial", label: "Guide" },
  { to: "/blog", label: "Insights" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/terms", label: "Terms & Conditions" },
];

// Content-page links shown inline on the branding bar (desktop). The legal docs
// are grouped into the "Policies" dropdown instead of scattered inline. Both
// collapse into the hamburger drawer (which uses CONTENT above) at <=980px.
const BRAND_LINKS = [
  { to: "/tutorial", label: "Guide" },
  { to: "/blog", label: "Insights" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

// Public nav shown on the content pages when logged out (a focused subset).
const PUBLIC_NAV = [
  { to: "/", label: "Home" },
  { to: "/tutorial", label: "Guide" },
  { to: "/blog", label: "Insights" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

/**
 * The single, shared top bar used by BOTH the app shell and the public content
 * pages, so the chrome is identical everywhere:
 *  - Logged in  → full app bar (brand, home, alerts, nav, theme, credits, user,
 *    sign-out, scrip search) — lets you jump back to the Screener from any page.
 *  - Logged out → trimmed bar (brand, theme, the public nav, Sign in) with no
 *    username/credits and only the public links clickable.
 */
export default function TopBar() {
  const { user, isAuthed, signOut } = useAuth();
  const nav = useNavigate();
  // On mobile the nav collapses into a hideable left drawer; this toggles it.
  const [menuOpen, setMenuOpen] = useState(false);
  // "Policies" dropdown (legal docs) on the branding bar.
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const policiesRef = useRef<HTMLDivElement>(null);

  // Close the drawer on Escape for keyboard/back-friendly dismissal.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Close the Policies dropdown on outside click / Escape.
  useEffect(() => {
    if (!policiesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (policiesRef.current && !policiesRef.current.contains(e.target as Node)) setPoliciesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoliciesOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [policiesOpen]);

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    nav("/login");
  };

  const backdrop = (
    <button
      type="button"
      className={"nav-backdrop" + (menuOpen ? " show" : "")}
      aria-hidden="true"
      tabIndex={-1}
      onClick={() => setMenuOpen(false)}
    />
  );

  // ---- Logged-out: trimmed public bar ----
  if (!isAuthed) {
    return (
      <>
        <header className="topbar">
          <div className="brand-cluster">
            <button
              type="button"
              className="nav-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MenuIcon open={menuOpen} />
            </button>
            <Link to="/" className="topbar-brand" aria-label="Home">
              <Logo size={24} />
            </Link>
          </div>

          <Link to="/login" className="signin-btn">
            Sign in
          </Link>

          <div className="topbar-right">
            <ThemeToggle />
          </div>
        </header>

        {/* Page nav — its own full-width bar below the branding bar (collapses
            into the hamburger drawer on narrow screens). */}
        <nav className={"topnav" + (menuOpen ? " open" : "")}>
          {PUBLIC_NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
              onClick={() => setMenuOpen(false)}
            >
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {backdrop}
      </>
    );
  }

  // ---- Logged-in: full app bar ----
  return (
    <>
      <header className="topbar">
        {/* Glossy black frame keeps the logo + wordmark + hamburger legible in
            ANY theme (the white theme otherwise washes the logo out). */}
        <div className="brand-cluster">
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

        {/* Content pages as inline buttons on the branding bar (desktop), plus a
            "Policies" dropdown for the legal docs. Both collapse into the
            hamburger drawer at <=980px (see CSS). */}
        <nav className="brand-links">
          {BRAND_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => "brand-link" + (isActive ? " active" : "")}
            >
              {label}
            </NavLink>
          ))}

          <div className="brand-more" ref={policiesRef}>
            <button
              type="button"
              className={"brand-link brand-more-btn" + (policiesOpen ? " active" : "")}
              aria-haspopup="menu"
              aria-expanded={policiesOpen}
              onClick={() => setPoliciesOpen((v) => !v)}
            >
              <span>Policies</span>
              <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {policiesOpen && (
              <div className="brand-more-pop" role="menu">
                {LEGAL_DOCS.map((d) => (
                  <Link
                    key={d.key}
                    to={`/legal/${d.key}`}
                    className="brand-more-link"
                    onClick={() => setPoliciesOpen(false)}
                  >
                    {d.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <button type="button" className="signout-btn" onClick={handleSignOut}>
          Sign out
        </button>

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

      {/* Page nav — its own full-width bar below the branding bar so the long
          app nav never crowds the branding row (which used to push "Sign out"
          off-screen). Collapses into the hamburger drawer on narrow screens. */}
      <nav className={"topnav" + (menuOpen ? " open" : "")}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
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
      {backdrop}
    </>
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
