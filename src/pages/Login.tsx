import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type OAuthProvider } from "../auth/AuthContext";
import Logo from "../components/Logo";
import "./Login.css";

const SOCIALS: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: "google", label: "Google", icon: "G" },
  { id: "twitter", label: "X", icon: "𝕏" },
  { id: "github", label: "GitHub", icon: "" },
];

export default function Login() {
  const { signIn, signUp, oauth, bypass, cloud, isAuthed, loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // After an OAuth round-trip (or any established session), forward into the app.
  useEffect(() => {
    if (!loading && isAuthed) nav("/app/screener", { replace: true });
  }, [loading, isAuthed, nav]);

  const social = async (id: OAuthProvider) => {
    setError(null);
    const { error } = await oauth(id);
    if (error) setError(error);
    // success → full-page redirect to the provider, nothing else to do here.
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn = mode === "signup" ? signUp : signIn;
    const { error } = await fn(email || "trader@taureye.local", password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (cloud && mode === "signup") {
      // Supabase may require email confirmation before a session exists.
      setError("Check your email to confirm your account, then sign in.");
      setMode("signin");
      return;
    }
    nav("/app/screener");
  };

  const skip = () => {
    bypass();
    nav("/app/screener");
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <Logo size={48} withWordmark={false} />
          <img src="/wordmark.png" alt="TaurEye — Watch. Analyze. Trade." className="login-wordmark" />
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="login-switch">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="login-link"
            onClick={() => {
              setError(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>

        {cloud && (
          <>
            <div className="login-divider"><span>or continue with</span></div>
            <div className="social-row">
              {SOCIALS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="social-btn"
                  onClick={() => social(s.id)}
                  title={`Continue with ${s.label}`}
                >
                  <span className="social-icon">{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="login-divider"><span>or</span></div>

        <button type="button" className="btn-ghost" onClick={skip}>
          Continue without signing in →
        </button>
      </div>

      <footer className="login-foot">
        {cloud ? "TaurEye" : "TaurEye · local preview · guest mode"}
      </footer>
    </div>
  );
}
