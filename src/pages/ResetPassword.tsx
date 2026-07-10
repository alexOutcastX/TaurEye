import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import Wordmark from "../components/Wordmark";
import LegalLinks from "../components/LegalLinks";
import "./Login.css";
import "../components/AuthPanel.css";

/**
 * Landing screen for a password-recovery link. Supabase has already exchanged
 * the link for a temporary recovery session (web: detectSessionInUrl; native:
 * the deep-link handler in main.tsx), so here the user just chooses a new
 * password and is signed in.
 */
export default function ResetPassword() {
  const { updatePassword, clearRecovery, cloud } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    clearRecovery();
    setDone(true);
    setTimeout(() => nav("/app/dashboard", { replace: true }), 1200);
  };

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <Logo size={72} withWordmark={false} />
        <Wordmark className="login-wordmark" />
      </div>
      <div className="login-body">
        <div className="auth-panel">
          <h1 className="auth-heading">Set a new password</h1>
          {!cloud ? (
            <p className="auth-error">Password reset needs the cloud backend.</p>
          ) : done ? (
            <p className="auth-note">Password updated — signing you in…</p>
          ) : (
            <form onSubmit={submit} className="auth-form">
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <div className="auth-inputgroup">
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button type="submit" className="auth-go" disabled={busy} aria-label="Update password">
                    {busy ? "…" : "→"}
                  </button>
                </div>
              </label>
              {error && <p className="auth-error">{error}</p>}
            </form>
          )}
        </div>
        <LegalLinks className="login-legal" />
      </div>
    </div>
  );
}
