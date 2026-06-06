// Capgo OTA status — surfaces the over-the-air update lifecycle so the loading
// screen can tell the user when a new bundle is downloading/ready. Native only;
// every export is a safe no-op on the web build (no Capgo events ever fire).
//
// With autoUpdate on, Capgo checks the channel at launch and downloads a new
// web bundle in the background; it's applied on the next launch. We listen to
// the plugin's lifecycle events and expose a tiny observable status the
// LoadingScreen subscribes to.

import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

export type OtaState =
  | "idle" // nothing happening yet
  | "checking" // asked Capgo whether a newer bundle exists
  | "downloading" // pulling the new bundle (percent populated)
  | "ready" // downloaded; applies on next launch
  | "uptodate" // already on the latest bundle
  | "failed"; // download/install failed — staying on the current bundle

export interface OtaStatus {
  state: OtaState;
  percent: number; // 0–100 while downloading
  version?: string; // the incoming bundle version, once known
}

let status: OtaStatus = { state: "idle", percent: 0 };
const listeners = new Set<(s: OtaStatus) => void>();

function emit(patch: Partial<OtaStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getOtaStatus(): OtaStatus {
  return status;
}

export function onOtaChange(cb: (s: OtaStatus) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** A short line for the loading screen, or null when there's nothing to surface. */
export function otaMessage(s: OtaStatus): string | null {
  switch (s.state) {
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return `Downloading update… ${s.percent}%`;
    case "ready":
      return "Update ready — applies on next launch";
    case "uptodate":
      return "App is up to date";
    case "failed":
      return "Update failed — using the installed version";
    default:
      return null; // idle → nothing to surface
  }
}

let started = false;

/** Register Capgo OTA listeners once. No-op on web or if already started. */
export function initOta(): void {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  emit({ state: "checking" });

  CapacitorUpdater.addListener("updateAvailable", (e) => {
    emit({ state: "downloading", version: e.bundle.version });
  });
  CapacitorUpdater.addListener("download", (e) => {
    emit({
      state: "downloading",
      percent: Math.max(0, Math.min(100, Math.round(e.percent ?? 0))),
      version: e.bundle.version,
    });
  });
  CapacitorUpdater.addListener("downloadComplete", (e) => {
    emit({ state: "ready", percent: 100, version: e.bundle.version });
  });
  CapacitorUpdater.addListener("noNeedUpdate", () => {
    emit({ state: "uptodate" });
  });
  CapacitorUpdater.addListener("downloadFailed", () => {
    emit({ state: "failed" });
  });
  CapacitorUpdater.addListener("updateFailed", () => {
    emit({ state: "failed" });
  });
}

/**
 * Explicitly ask the channel for the latest bundle on this launch and surface
 * the result on the loading screen. Non-destructive: it does NOT download/apply
 * itself — Capgo's autoUpdate (onLaunch) owns applying the bundle. This just
 * *forces a visible check at every startup* and reports the outcome.
 * Resolves quickly; never throws (so it can't block boot). No-op on web.
 */
export async function checkForUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  emit({ state: "checking", percent: 0 });
  try {
    const [latest, cur] = await Promise.all([
      CapacitorUpdater.getLatest(),
      CapacitorUpdater.current(),
    ]);
    const curVer = cur?.bundle?.version;
    const noNew = /no new version/i.test(latest?.message ?? "");
    const newer =
      !!latest?.version && latest.version !== curVer && latest.version !== "builtin" && !noNew;
    emit(newer ? { state: "ready", version: latest.version } : { state: "uptodate" });
  } catch {
    emit({ state: "idle" }); // a failed check must not stall startup
  }
}
