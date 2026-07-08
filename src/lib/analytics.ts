// Lightweight product analytics — batches events to the self-hosted Supabase
// (public.analytics_events; see supabase/analytics.sql). Fire-and-forget by
// design: never throws, never blocks the UI, and is a complete no-op when the
// cloud backend isn't configured (local/dev builds). Admin dashboards read the
// aggregates via the admin-gated RPCs (src/pages/Admin.tsx).
import { Capacitor } from "@capacitor/core";
import { isSupabaseConfigured, supabase } from "./supabase";

type Props = Record<string, string | number | boolean | null>;
interface Row {
  user_id: string | null;
  session_id: string;
  event: string;
  props: Props;
  platform: string;
  app_version: string | null;
  path: string | null;
}

const FLUSH_EVERY_MS = 15_000;
const FLUSH_AT = 20; // queue size that triggers an immediate flush
const SID_KEY = "taureye.asid";

const platform = ((): string => {
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : "web";
})();
const appVersion = (import.meta.env.VITE_APP_VERSION ?? "").trim() || null;

// One id per browser session (tab-scoped is fine for session counting).
function sessionId(): string {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return "nosession";
  }
}

// Track the auth uid without an async lookup per event.
let uid: string | null = null;
if (supabase) {
  void supabase.auth.getUser().then(({ data }) => {
    uid = data.user?.id ?? null;
  });
  supabase.auth.onAuthStateChange((_evt, session) => {
    uid = session?.user?.id ?? null;
  });
}

let queue: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function flush(): Promise<void> {
  if (!supabase || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    // RLS: signed-in rows must carry the signer's uid; guest rows must be null.
    await supabase.from("analytics_events").insert(batch);
  } catch {
    /* analytics must never surface an error */
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_EVERY_MS);
}

function startLifecycleFlush(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  // Flush when the tab hides / closes so short sessions aren't lost.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  window.addEventListener("pagehide", () => void flush());
}

/** Record one product event. Safe to call from anywhere, anytime. */
export function track(event: string, props: Props = {}, path?: string): void {
  if (!isSupabaseConfigured) return;
  startLifecycleFlush();
  queue.push({
    user_id: uid,
    session_id: sessionId(),
    event: event.slice(0, 64),
    props,
    platform,
    app_version: appVersion,
    path: (path ?? (typeof location !== "undefined" ? location.pathname : null))?.slice(0, 256) ?? null,
  });
  if (queue.length >= FLUSH_AT) void flush();
  else schedule();
}

let lastPath: string | null = null;
/** Page-view helper — dedupes consecutive views of the same path. */
export function trackPageView(path: string): void {
  if (path === lastPath) return;
  lastPath = path;
  track("page_view", {}, path);
}
