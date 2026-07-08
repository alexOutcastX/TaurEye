import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isSupabaseConfigured, supabase } from "../src/lib/supabase";
import { ExportMenu } from "../src/components/TableTools";
import "./admin.css";

// Standalone admin console. Sign in with an admin account (app_admins —
// supabase/analytics.sql); every read goes through admin-gated SECURITY
// DEFINER RPCs, so this UI is a viewer, not a gate.

interface Overview {
  total_users: number;
  new_users_7d: number;
  dau: number;
  wau: number;
  mau: number;
  events_today: number;
  sessions_today: number;
}
interface Daily {
  day: string;
  active_users: number;
  sessions: number;
  events: number;
  signups: number;
}
interface TopEvent {
  event: string;
  hits: number;
  users: number;
}
interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  provider: string | null;
  joined_at: string;
  last_seen: string | null;
  sessions_30d: number;
  events_30d: number;
  top_event: string | null;
}

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Login({ onError }: { onError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(onError);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) setError(err.message);
    // success → onAuthStateChange in AdminApp re-renders into the dashboard
  };

  return (
    <div className="adm-login">
      <form className="adm-login-card" onSubmit={submit}>
        <h1>TaurEye Admin</h1>
        <p className="adm-note">Sign in with an admin account.</p>
        <input
          type="email"
          placeholder="Email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="adm-login-err">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(isSupabaseConfigured ? null : false);
  const [who, setWho] = useState<string>("");
  const [state, setState] = useState<"loading" | "denied" | "ok" | "error">("loading");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [top, setTop] = useState<TopEvent[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [hover, setHover] = useState<number | null>(null);

  // Session lifecycle.
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setWho(data.session?.user.email ?? "");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthed(!!s);
      setWho(s?.user.email ?? "");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the dashboards once signed in.
  useEffect(() => {
    if (!supabase || !authed) return;
    let alive = true;
    setState("loading");
    void (async () => {
      const [ov, dl, te, us] = await Promise.all([
        supabase.rpc("analytics_overview"),
        supabase.rpc("analytics_daily", { p_days: 30 }),
        supabase.rpc("analytics_top_events", { p_days: 7 }),
        supabase.rpc("analytics_users", { p_limit: 200 }),
      ]);
      if (!alive) return;
      const err = ov.error ?? dl.error ?? te.error ?? us.error;
      if (err) {
        setState(/not authorized/i.test(err.message) ? "denied" : "error");
        return;
      }
      setOverview((ov.data?.[0] as Overview) ?? null);
      setDaily((dl.data as Daily[]) ?? []);
      setTop((te.data as TopEvent[]) ?? []);
      setUsers((us.data as UserRow[]) ?? []);
      setState("ok");
    })();
    return () => {
      alive = false;
    };
  }, [authed]);

  const maxActive = useMemo(() => Math.max(1, ...daily.map((d) => d.active_users)), [daily]);

  if (!isSupabaseConfigured) {
    return (
      <section className="adm">
        <h1>TaurEye Admin</h1>
        <p className="adm-note">This build has no cloud backend configured (VITE_SUPABASE_URL).</p>
      </section>
    );
  }
  if (authed === null) {
    return (
      <section className="adm">
        <p className="adm-note">Loading…</p>
      </section>
    );
  }
  if (!authed) return <Login onError={null} />;

  const signOut = () => {
    void supabase?.auth.signOut();
  };

  if (state === "denied") {
    return (
      <section className="adm">
        <h1>TaurEye Admin</h1>
        <p className="adm-note">
          <strong>{who}</strong> is not an admin. Add the account to <code>app_admins</code>{" "}
          (see supabase/analytics.sql), then reload.
        </p>
        <button className="adm-signout" onClick={signOut}>Sign out</button>
      </section>
    );
  }
  if (state === "error") {
    return (
      <section className="adm">
        <h1>TaurEye Admin</h1>
        <p className="adm-note">
          Couldn't load analytics — is <code>supabase/analytics.sql</code> applied on the server?
        </p>
        <button className="adm-signout" onClick={signOut}>Sign out</button>
      </section>
    );
  }
  if (state === "loading") {
    return (
      <section className="adm">
        <h1>TaurEye Admin</h1>
        <p className="adm-note">Loading…</p>
      </section>
    );
  }

  const stats: Array<[string, number | string]> = overview
    ? [
        ["Total users", overview.total_users],
        ["New (7d)", overview.new_users_7d],
        ["Active today", overview.dau],
        ["Active (7d)", overview.wau],
        ["Active (30d)", overview.mau],
        ["Sessions today", overview.sessions_today],
        ["Events today", overview.events_today],
      ]
    : [];

  return (
    <section className="adm">
      <header className="adm-head">
        <h1>TaurEye Admin</h1>
        <span className="adm-sub">Product usage · last 30 days</span>
        <span className="adm-spacer" />
        <span className="adm-who">{who}</span>
        <button className="adm-signout" onClick={signOut}>Sign out</button>
      </header>

      <div className="adm-stats">
        {stats.map(([label, value]) => (
          <div key={label} className="adm-stat">
            <span className="adm-stat-value">{value}</span>
            <span className="adm-stat-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-card-head">
          <h2>Daily active users</h2>
          <ExportMenu
            filename="taureye-analytics-daily"
            title="Analytics — daily activity"
            subtitle="Last 30 days"
            getData={() => ({
              columns: [
                { key: "day", label: "Day" },
                { key: "active_users", label: "Active users", align: "right" },
                { key: "sessions", label: "Sessions", align: "right" },
                { key: "events", label: "Events", align: "right" },
                { key: "signups", label: "Signups", align: "right" },
              ],
              rows: daily.map((d) => ({
                day: d.day,
                active_users: String(d.active_users),
                sessions: String(d.sessions),
                events: String(d.events),
                signups: String(d.signups),
              })),
            })}
          />
        </div>
        <div className="adm-chart" onMouseLeave={() => setHover(null)}>
          {daily.map((d, i) => (
            <div
              key={d.day}
              className="adm-bar-slot"
              onMouseEnter={() => setHover(i)}
              aria-label={`${fmtDay(d.day)}: ${d.active_users} active users`}
            >
              <div
                className="adm-bar"
                style={{ height: `${Math.max(2, (d.active_users / maxActive) * 100)}%` }}
              />
            </div>
          ))}
          {hover != null && daily[hover] && (
            <div
              className="adm-tip"
              style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}
              role="status"
            >
              <strong>{fmtDay(daily[hover].day)}</strong>
              <span>{daily[hover].active_users} active · {daily[hover].sessions} sessions</span>
              <span>{daily[hover].events} events · {daily[hover].signups} signups</span>
            </div>
          )}
        </div>
        <div className="adm-chart-x">
          <span>{daily.length ? fmtDay(daily[0].day) : ""}</span>
          <span>{daily.length ? fmtDay(daily[daily.length - 1].day) : ""}</span>
        </div>
      </div>

      <div className="adm-grid">
        <div className="adm-card">
          <div className="adm-card-head">
            <h2>Top features (7d)</h2>
          </div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Event</th>
                <th className="num">Hits</th>
                <th className="num">Users</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.event}>
                  <td>{t.event}</td>
                  <td className="num">{t.hits}</td>
                  <td className="num">{t.users}</td>
                </tr>
              ))}
              {top.length === 0 && (
                <tr>
                  <td colSpan={3} className="adm-empty">No events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="adm-card adm-card-wide">
          <div className="adm-card-head">
            <h2>User accounts</h2>
            <ExportMenu
              filename="taureye-analytics-users"
              title="Analytics — user accounts"
              subtitle={`${users.length} accounts`}
              getData={() => ({
                columns: [
                  { key: "email", label: "Email" },
                  { key: "display_name", label: "Name" },
                  { key: "provider", label: "Provider" },
                  { key: "joined_at", label: "Joined" },
                  { key: "last_seen", label: "Last seen" },
                  { key: "sessions_30d", label: "Sessions 30d", align: "right" },
                  { key: "events_30d", label: "Events 30d", align: "right" },
                  { key: "top_event", label: "Top feature" },
                ],
                rows: users.map((u) => ({
                  email: u.email ?? "",
                  display_name: u.display_name ?? "",
                  provider: u.provider ?? "email",
                  joined_at: fmtWhen(u.joined_at),
                  last_seen: fmtWhen(u.last_seen),
                  sessions_30d: String(u.sessions_30d),
                  events_30d: String(u.events_30d),
                  top_event: u.top_event ?? "",
                })),
              })}
            />
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Provider</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th className="num">Sessions 30d</th>
                  <th className="num">Events 30d</th>
                  <th>Top feature</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id}>
                    <td>{u.email ?? "—"}{u.display_name ? <span className="adm-dim"> · {u.display_name}</span> : null}</td>
                    <td>{u.provider ?? "email"}</td>
                    <td>{fmtWhen(u.joined_at)}</td>
                    <td>{fmtWhen(u.last_seen)}</td>
                    <td className="num">{u.sessions_30d}</td>
                    <td className="num">{u.events_30d}</td>
                    <td>{u.top_event ?? "—"}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="adm-empty">No accounts yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
