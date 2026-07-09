import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import AuthPanel from "../components/AuthPanel";
import BullMark from "../components/BullMark";
import ErrorBoundary from "../components/ErrorBoundary";
import Logo from "../components/Logo";
import LegalLinks from "../components/LegalLinks";
import Disclaimer from "../components/Disclaimer";
import "./Login.css";

// 3D bull head (three.js) — lazy-loaded so it doesn't bloat startup. Falls back
// to the static SVG mark while loading, on reduced-motion, or if WebGL is
// unavailable on the device's WebView.
const BullScene = lazy(() => import("../components/BullScene"));

/**
 * Minimal sign-in screen — large branding anchored top-centre, the 3D bull head
 * in the middle, the login widget lower on the screen with no enclosing card.
 * Native start + web /login.
 */
export default function Login() {
  return (
    <div className="login-wrap">
      <div className="login-brand">
        <Logo size={72} withWordmark={false} />
        <img src="/wordmark.png" alt="TaurEye" className="login-wordmark" />
      </div>
      <div className="login-mid">
        <ErrorBoundary fallback={<BullMark size={150} />}>
          <Suspense fallback={<BullMark size={150} />}>
            <BullScene className="login-bull3d" />
          </Suspense>
        </ErrorBoundary>
      </div>
      <div className="login-body">
        <AuthPanel />
        <nav className="login-links">
          <Link to="/blog">Insights</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <LegalLinks className="login-legal" />
      </div>
      <Disclaimer />
    </div>
  );
}
