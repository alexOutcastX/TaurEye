import { useAuth } from "../auth/AuthContext";
import AuthPanel from "../components/AuthPanel";
import Logo from "../components/Logo";
import "./Login.css";

export default function Login() {
  const { cloud } = useAuth();

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <Logo size={48} withWordmark={false} />
          <img src="/wordmark.png" alt="TaurEye — Watch. Analyze. Trade." className="login-wordmark" />
        </div>

        <AuthPanel />
      </div>

      <footer className="login-foot">
        {cloud ? "TaurEye" : "TaurEye · local preview · guest mode"}
      </footer>
    </div>
  );
}
