import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { claimPendingReferral, pendingRefCode } from "../lib/referral";

type User = { id?: string; name: string; email: string } | null;

type Result = { error?: string };

/** OAuth providers we expose (must be enabled in the Supabase dashboard). */
export type OAuthProvider = "google" | "twitter" | "github" | "apple" | "facebook";

type AuthState = {
  user: User;
  isAuthed: boolean;
  loading: boolean;
  /** True when a real cloud backend (Supabase) is configured. */
  cloud: boolean;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (email: string, password: string) => Promise<Result>;
  oauth: (provider: OAuthProvider) => Promise<Result>;
  /** Email a password-reset link (no-op without SMTP configured server-side). */
  resetPassword: (email: string) => Promise<Result>;
  /** Re-send the signup confirmation email. */
  resendConfirmation: (email: string) => Promise<Result>;
  /** Set a new password for the user in the current (recovery) session. */
  updatePassword: (password: string) => Promise<Result>;
  /** True after a password-recovery link establishes a session. */
  recovery: boolean;
  clearRecovery: () => void;
  bypass: () => void;
  signOut: () => Promise<void>;
};

const STORAGE_KEY = "taureye.session";
const AuthCtx = createContext<AuthState | null>(null);

function nameFromEmail(email: string): string {
  return email.split("@")[0] || "Trader";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cloud = isSupabaseConfigured;
  const [user, setUser] = useState<User>(() => {
    if (cloud) return null; // hydrated from the Supabase session below
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(cloud);
  // Set when the user arrives via a password-recovery link — the app routes them
  // to /reset-password to choose a new password (see App.tsx).
  const [recovery, setRecovery] = useState(false);

  // ---- cloud (Supabase) session lifecycle ----
  useEffect(() => {
    if (!cloud || !supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const s = data.session;
      setUser(s ? { id: s.user.id, email: s.user.email ?? "", name: nameFromEmail(s.user.email ?? "") } : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setUser(s ? { id: s.user.id, email: s.user.email ?? "", name: nameFromEmail(s.user.email ?? "") } : null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [cloud]);

  // ---- referral: redeem a stashed invite code once the user is signed in ----
  // claim_referral() is server-side one-time (already_referred guard), so this
  // is safe to fire on every session hydration; it clears the stash either way.
  useEffect(() => {
    if (cloud && user?.id && pendingRefCode()) void claimPendingReferral();
  }, [cloud, user?.id]);

  // ---- local (no-cloud) session persistence ----
  useEffect(() => {
    if (cloud) return;
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  }, [user, cloud]);

  const signIn = async (email: string, password: string): Promise<Result> => {
    if (cloud && supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    }
    setUser({ name: nameFromEmail(email), email });
    return {};
  };

  const signUp = async (email: string, password: string): Promise<Result> => {
    if (cloud && supabase) {
      const { error } = await supabase.auth.signUp({ email, password });
      return error ? { error: error.message } : {};
    }
    setUser({ name: nameFromEmail(email), email });
    return {};
  };

  // Social sign-in. Web: full-page redirect to the provider and back to /login.
  // Native (APK): open the provider in the system browser and return via the
  // app.taureye.mobile:// deep link (handled in main.tsx -> exchangeCode).
  // Providers must be enabled in Supabase → Authentication → Providers.
  const oauth = async (provider: OAuthProvider): Promise<Result> => {
    if (!cloud || !supabase) return { error: "Social sign-in needs the cloud backend." };
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: "app.taureye.mobile://auth-callback", skipBrowserRedirect: true },
      });
      if (error) return { error: error.message };
      if (data?.url) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
      }
      return {};
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/login` },
    });
    return error ? { error: error.message } : {};
  };

  // Email a reset link. The link returns to /reset-password (web) or the native
  // deep link, where updatePassword sets the new password. Requires SMTP to be
  // configured server-side, otherwise the email is never delivered.
  const resetPassword = async (email: string): Promise<Result> => {
    if (!cloud || !supabase) return { error: "Password reset needs the cloud backend." };
    const { Capacitor } = await import("@capacitor/core");
    const redirectTo = Capacitor.isNativePlatform()
      ? "app.taureye.mobile://auth-callback"
      : `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return error ? { error: error.message } : {};
  };

  // Re-send the signup confirmation email (needs SMTP server-side).
  const resendConfirmation = async (email: string): Promise<Result> => {
    if (!cloud || !supabase) return { error: "Not available offline." };
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    return error ? { error: error.message } : {};
  };

  // Set a new password using the active (recovery) session.
  const updatePassword = async (password: string): Promise<Result> => {
    if (!cloud || !supabase) return { error: "Not available offline." };
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: error.message } : {};
  };

  const clearRecovery = () => setRecovery(false);

  // Guest mode (kept for local use / preview).
  const bypass = () => setUser({ name: "Guest", email: "guest@taureye.local" });

  const signOut = async () => {
    if (cloud && supabase) await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthCtx.Provider
      value={{ user, isAuthed: !!user, loading, cloud, signIn, signUp, oauth, resetPassword, resendConfirmation, updatePassword, recovery, clearRecovery, bypass, signOut }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider; HMR-only concern
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
