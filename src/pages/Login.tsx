import { useAuth } from "../auth/AuthContext";
import AuthPanel from "../components/AuthPanel";
import Logo from "../components/Logo";
import "./Login.css";

/**
 * TaurEye sign-in screen — a frosted "glassmorphism" card floating over a
 * flowing brand-green aurora (pure CSS, no image assets). This is the native
 * app's start screen and the web /login route; the web marketing Landing lives
 * at /. Branding (logo + wordmark) sits inside the card; AuthPanel supplies the
 * form, social buttons and guest entry.
 */
export default function Login() {
  const { cloud } = useAuth();

  return (
    <div className="login-wrap">
      <div className="login-aurora" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>

      <div className="login-card">
        <div className="login-brand">
          <Logo size={46} withWordmark={false} />
          <img src="/wordmark.png" alt="TaurEye" className="login-wordmark" />
        </div>
        <h1 className="login-welcome">Welcome back</h1>
        <p className="login-welcome-sub">Watch · Analyze · Trade smarter</p>

        <AuthPanel />
      </div>

      <footer className="login-foot">
        {cloud ? "TaurEye" : "TaurEye · local preview · guest mode"}
      </footer>
    </div>
  );
}
