import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, type OAuthProvider } from "../auth/AuthContext";
import { storeRefCode } from "../lib/referral";
import "./AuthPanel.css";

const SOCIALS: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: "google", label: "Google", icon: "G" },
  { id: "twitter", label: "X", icon: "𝕏" },
  { id: "github", label: "GitHub", icon: "" },
  { id: "apple", label: "Apple", icon: "" },
  { id: "facebook", label: "Facebook", icon: "f" },
];

// Only show providers you've actually enabled in Supabase, so users never hit
// the "provider is not enabled" page. Set VITE_OAUTH_PROVIDERS to a comma list
// (e.g. "google,github") to whitelist; unset = show all (dev convenience).
const ENABLED = (import.meta.env.VITE_OAUTH_PROVIDERS ?? "")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);
const VISIBLE_SOCIALS = ENABLED.length
  ? SOCIALS.filter((s) => ENABLED.includes(s.id))
  : SOCIALS;

/**
 * Self-contained email/password + social + guest sign-in widget. Shared by the
 * Login page and the Landing hero so auth behaviour lives in one place. Captures
 * an invite code (?ref=CODE) and forwards into the app once a session exists.
 */
export default function AuthPanel() {
  const { signIn, signUp, oauth, bypass, cloud, isAuthed, loading } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Invite link (?ref=CODE): stash the code; it's redeemed automatically after
  // the account's first sign-in (AuthContext -> claimPendingReferral).
  useEffect(() => {
    const ref = params.get("ref");
    if (ref) storeRefCode(ref);
  }, [params]);

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
    <div className="auth-panel">
      <form onSubmit={submit} className="auth-form">
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

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="auth-switch">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="auth-link"
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>

      {cloud && VISIBLE_SOCIALS.length > 0 && (
        <>
          <div className="auth-divider"><span>or continue with</span></div>
          <div className="social-row">
            {VISIBLE_SOCIALS.map((s) => (
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

      <div className="auth-divider"><span>or</span></div>

      <button type="button" className="btn-ghost" onClick={skip}>
        Continue without signing in →
      </button>
    </div>
  );
}
