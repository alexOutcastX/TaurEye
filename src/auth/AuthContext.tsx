import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type User = { id?: string; name: string; email: string } | null;

type Result = { error?: string };

/** OAuth providers we expose (must be enabled in the Supabase dashboard). */
export type OAuthProvider = "google" | "twitter" | "github" | "apple";

type AuthState = {
  user: User;
  isAuthed: boolean;
  loading: boolean;
  /** True when a real cloud backend (Supabase) is configured. */
  cloud: boolean;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (email: string, password: string) => Promise<Result>;
  oauth: (provider: OAuthProvider) => Promise<Result>;
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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s ? { id: s.user.id, email: s.user.email ?? "", name: nameFromEmail(s.user.email ?? "") } : null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [cloud]);

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

  // Social sign-in: redirects to the provider, then back to /login (which
  // forwards into the app once the session is established). Providers must be
  // enabled in Supabase → Authentication → Providers.
  const oauth = async (provider: OAuthProvider): Promise<Result> => {
    if (!cloud || !supabase) return { error: "Social sign-in needs the cloud backend." };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/login` },
    });
    return error ? { error: error.message } : {};
  };

  // Guest mode (kept for local use / preview).
  const bypass = () => setUser({ name: "Guest", email: "guest@taureye.local" });

  const signOut = async () => {
    if (cloud && supabase) await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthCtx.Provider
      value={{ user, isAuthed: !!user, loading, cloud, signIn, signUp, oauth, bypass, signOut }}
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
