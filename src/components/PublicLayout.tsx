import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LEGAL, LEGAL_DOCS } from "../config/legal";
import Logo from "./Logo";
import "./PublicLayout.css";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/blog", label: "Insights" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

/**
 * Shared chrome for the public, no-login content pages (About, Contact, the
 * Insights blog + articles). Top nav + footer with legal links; a single CTA
 * that opens the app or sends visitors to sign in.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const { pathname } = useLocation();
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="pub">
      <header className="pub-top">
        <Link to="/" className="pub-brand" aria-label="Home">
          <Logo />
        </Link>
        <nav className="pub-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={isActive(n.to) ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link to={isAuthed ? "/app/dashboard" : "/login"} className="pub-cta">
          {isAuthed ? "Open app →" : "Sign in"}
        </Link>
      </header>

      <main className="pub-main">{children}</main>

      <footer className="pub-foot">
        <span>© {new Date().getFullYear()} {LEGAL.entity}</span>
        <span className="pub-foot-links">
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          {LEGAL_DOCS.map((d) => (
            <Link key={d.key} to={`/legal/${d.key}`}>{d.title}</Link>
          ))}
        </span>
        <span className="pub-foot-note">
          Educational &amp; informational content only — not investment advice.
        </span>
      </footer>
    </div>
  );
}
