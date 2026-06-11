import AuthPanel from "../components/AuthPanel";
import BullRun from "../components/BullRun";
import Logo from "../components/Logo";
import "./Login.css";

/**
 * Minimal sign-in screen — large branding anchored top-centre, a tiny galloping
 * bull in the middle, the login widget lower on the screen with no enclosing
 * card. Native start + web /login.
 */
export default function Login() {
  return (
    <div className="login-wrap">
      <div className="login-brand">
        <Logo size={72} withWordmark={false} />
        <img src="/wordmark.png" alt="TaurEye" className="login-wordmark" />
      </div>
      <div className="login-mid">
        <BullRun size={210} />
      </div>
      <div className="login-body">
        <AuthPanel />
      </div>
    </div>
  );
}
