import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL, LEGAL_DOCS } from "../config/legal";
import TopBar from "./TopBar";
import "./PublicLayout.css";

/**
 * Shared chrome for the public, no-login content pages (About, Contact, the
 * Insights blog + articles). Uses the SAME top bar as the app (via <TopBar/>),
 * so logged-in visitors get the full app nav (and can jump back to the Screener)
 * and logged-out visitors get a trimmed bar with the public nav + Sign in.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pub">
      <TopBar />

      <main className="pub-main">{children}</main>

      <footer className="pub-foot">
        <span>© {new Date().getFullYear()} {LEGAL.entity}</span>
        <span className="pub-foot-links">
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/tutorial">Tutorials</Link>
          {LEGAL_DOCS.map((d) => (
            <Link key={d.key} to={`/legal/${d.key}`}>{d.title}</Link>
          ))}
        </span>
        <span className="pub-foot-note">
          Educational &amp; informational content only — not investment advice.
          TaurEye is not a SEBI-registered investment adviser or research analyst.{" "}
          <Link to="/legal/disclaimer">Full disclaimer</Link>.
        </span>
      </footer>
    </div>
  );
}
