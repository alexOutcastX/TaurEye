import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import "./Login.css";

export default function Login() {
  const { signIn, signUp, bypass, cloud } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
