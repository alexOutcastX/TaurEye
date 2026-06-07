// Local price-alert system. Alerts live on the device (localStorage). Because
// the data is end-of-day and there's no backend, alerts are evaluated when the
// app is open / launched: on each evaluation we compare the latest price against
// each alert and fire a LOCAL notification (native only) for any that crossed.
// Fires once per arm; a triggered alert is marked and won't re-fire until the
// user re-enables it.

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { api } from "../api/client";

export type AlertOp = "above" | "below";

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  op: AlertOp;
  price: number;
  enabled: boolean;
  createdAt: string;
  triggeredAt?: string | null;
  triggeredPrice?: number | null;
}

const KEY = "taureye.alerts.v1";
const EVT = "taureye:alerts";

export function getAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PriceAlert[]) : [];
  } catch {
    return [];
  }
}

function save(list: PriceAlert[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVT));
}

export function onAlertsChange(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function alertsForSymbol(symbol: string): PriceAlert[] {
  return getAlerts().filter((a) => a.symbol === symbol);
}

export function addAlert(a: Omit<PriceAlert, "id" | "createdAt" | "enabled" | "triggeredAt">): PriceAlert {
  const alert: PriceAlert = {
    ...a,
    id: Math.random().toString(36).slice(2, 10),
    enabled: true,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
  };
  save([...getAlerts(), alert]);
  void ensurePermission();
  return alert;
}

export function removeAlert(id: string): void {
  save(getAlerts().filter((a) => a.id !== id));
}

/** Toggle enabled; re-enabling also re-arms (clears the triggered state). */
export function toggleAlert(id: string): void {
  save(
    getAlerts().map((a) =>
      a.id === id ? { ...a, enabled: !a.enabled, triggeredAt: a.enabled ? a.triggeredAt : null } : a,
    ),
  );
}

/** Ask for notification permission (native only). Safe/no-op on web. */
export async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

// 32-bit int id for the native notification, derived from the alert id.
function notifId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

async function fire(alert: PriceAlert, price: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId(alert.id),
          title: `${alert.symbol} ${alert.op === "above" ? "↑" : "↓"} ₹${alert.price}`,
          body: `${alert.name} is now ₹${price.toFixed(2)} (alert: ${alert.op} ₹${alert.price}).`,
          schedule: { at: new Date(Date.now() + 300) },
        },
      ],
    });
  } catch {
    /* notification unavailable — alert still marked triggered below */
  }
}

let evaluating = false;

/**
 * Check every enabled, not-yet-triggered alert against the latest price and fire
 * a notification for any that crossed. Called on app launch / when data loads.
 * Returns the number of alerts triggered this pass.
 */
export async function evaluateAlerts(): Promise<number> {
  if (evaluating) return 0;
  evaluating = true;
  try {
    const list = getAlerts();
    const pending = list.filter((a) => a.enabled && !a.triggeredAt);
    if (pending.length === 0) return 0;

    // Unique symbols → one price lookup each (metrics are cached locally).
    const symbols = [...new Set(pending.map((a) => a.symbol))];
    const prices = new Map<string, number>();
    await Promise.all(
      symbols.map(async (s) => {
        try {
          const m = await api.metrics(s);
          if (typeof m.close === "number") prices.set(s, m.close);
        } catch {
          /* skip symbols we can't price right now */
        }
      }),
    );

    let fired = 0;
    const now = new Date().toISOString();
    const next = list.map((a) => {
      if (!a.enabled || a.triggeredAt) return a;
      const price = prices.get(a.symbol);
      if (price === undefined) return a;
      const hit = a.op === "above" ? price >= a.price : price <= a.price;
      if (!hit) return a;
      fired++;
      void fire(a, price);
      return { ...a, triggeredAt: now, triggeredPrice: price };
    });
    if (fired > 0) save(next);
    return fired;
  } finally {
    evaluating = false;
  }
}
