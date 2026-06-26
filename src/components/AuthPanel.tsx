import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, type OAuthProvider } from "../auth/AuthContext";
import { storeRefCode } from "../lib/referral";
import SocialIcon from "./SocialIcon";
import "./AuthPanel.css";

const SOCIALS: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "twitter", label: "X" },
  { id: "github", label: "GitHub" },
  { id: "apple", label: "Apple" },
  { id: "facebook", label: "Facebook" },
];

// Only show providers actually enabled in Supabase. Set VITE_OAUTH_PROVIDERS to
// a comma list (e.g. "google,twitter") to whitelist; unset defaults to Google
// only (the configured provider) so users never hit a "not enabled" page.
const ENABLED = (import.meta.env.VITE_OAUTH_PROVIDERS ?? "")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);
const VISIBLE_SOCIALS = ENABLED.length
  ? SOCIALS.filter((s) => ENABLED.includes(s.id))
  : SOCIALS.filter((s) => s.id === "google");

/**
 * Self-contained email/password + social + guest sign-in widget. Shared by the
 * Login page and the Landing hero so auth behaviour lives in one place. Captures
 * an invite code (?ref=CODE) and forwards into the app once a session exists.
 */
export default function AuthPanel() {
  const { signIn, signUp, oauth, resetPassword, cloud, isAuthed, loading } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forgot-password sub-flow: collect the email and request a reset link.
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  // Invite link (?ref=CODE): stash the code; it's redeemed automatically after
  // the account's first sign-in (AuthContext -> claimPendingReferral).
  useEffect(() => {
    const ref = params.get("ref");
    if (ref) storeRefCode(ref);
  }, [params]);

  // After an OAuth round-trip (or any established session), forward into the app.
  useEffect(() => {
    if (!loading && isAuthed) nav("/app/dashboard", { replace: true });
  }, [loading, isAuthed, nav]);

  const social = async (id: OAuthProvider) => {
    setError(null);
    const { error } = await oauth(id);
    if (error) setError(error);
    // success → full-page redirect to the provider, nothing else to do here.
  };

  // Forgot-password: email a reset link, then show a neutral confirmation (we
  // don't reveal whether the address exists).
  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    const { error } = await resetPassword(email);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setSent(true);
  };

  // Step 1: validate the email, then reveal the password field in the same box.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === "email") {
      if (!emailValid) {
        setError("Enter a valid email address.");
        return;
      }
      setStep("password");
      return;
    }
    if (mode === "signup" && !agreed) {
      setError("Please accept the Terms and Privacy Policy to create an account.");
      return;
    }
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
      setStep("email");
      return;
    }
    nav("/app/dashboard");
  };

  // Forgot-password view (separate from the sign-in/up form).
  if (forgot) {
    return (
      <div className="auth-panel">
        <form onSubmit={sendReset} className="auth-form">
          <button
            type="button"
            className="auth-back"
            onClick={() => { setForgot(false); setSent(false); setError(null); }}
          >
            ‹ Back to sign in
          </button>
          {sent ? (
            <p className="auth-note">
              If an account exists for <b>{email}</b>, a password-reset link is on its
              way. Check your inbox (and spam).
            </p>
          ) : (
            <label className="field">
              <span>Reset password — your email</span>
              <div className="auth-inputgroup">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="auth-go" disabled={busy} aria-label="Send reset link">
                  {busy ? "…" : "→"}
                </button>
              </div>
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <form onSubmit={submit} className="auth-form">
        {step === "email" ? (
          <label className="field">
            <span>Email</span>
            <div className="auth-inputgroup">
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              <button type="submit" className="auth-go" aria-label="Continue">→</button>
            </div>
          </label>
        ) : (
          <>
            <button
              type="button"
              className="auth-back"
              onClick={() => { setStep("email"); setError(null); }}
            >
              ‹ {email}
            </button>
            <label className="field">
              <span>Password</span>
              <div className="auth-inputgroup">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="auth-go"
                  disabled={busy}
                  aria-label={mode === "signup" ? "Create account" : "Sign in"}
                >
                  {busy ? "…" : "→"}
                </button>
              </div>
            </label>
            {mode === "signup" && (
              <label className="auth-consent">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to the <Link to="/legal/terms">Terms</Link> and{" "}
                  <Link to="/legal/privacy">Privacy Policy</Link>.
                </span>
              </label>
            )}
            {mode === "signin" && cloud && (
              <button
                type="button"
                className="auth-link auth-forgot"
                onClick={() => { setForgot(true); setSent(false); setError(null); }}
              >
                Forgot password?
              </button>
            )}
          </>
        )}

        {error && <p className="auth-error">{error}</p>}
      </form>

      <p className="auth-switch">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="auth-link"
          onClick={() => {
            setError(null);
            setStep("email");
            setAgreed(false);
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
                aria-label={`Continue with ${s.label}`}
              >
                <span className="social-icon"><SocialIcon provider={s.id} /></span>
                <span className="social-label">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
