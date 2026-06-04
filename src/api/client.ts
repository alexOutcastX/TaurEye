import type {
  Candle,
  FieldDef,
  IndicesResponse,
  Metrics,
  SavedScreen,
  ScreenRequest,
  ScreenResponse,
  Security,
  SegmentInfo,
} from "./types";
import { LOCAL_DATA } from "../data/source";
import {
  localCandles,
  localFields,
  localHealth,
  localIndices,
  localMetrics,
  localScreen,
  localSearch,
  localSegments,
} from "../data/snapshot";
import {
  localDeleteScreen,
  localListScreens,
  localSaveScreen,
} from "../data/localScreens";

// In the browser dev server this is empty -> "/api/..." goes through the Vite
// proxy. In the packaged mobile (APK) build there is no proxy, so set
// VITE_API_BASE at build time to the reachable backend, e.g.
//   VITE_API_BASE=http://192.168.1.20:8010   (your machine's LAN IP)
//   VITE_API_BASE=https://api.taureye.example (a hosted backend)
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
// Optional API key for a protected (public-hosted) backend. Baked in at build
// time via VITE_API_KEY; empty for local/LAN use.
const API_KEY = (import.meta.env.VITE_API_KEY ?? "").trim();

// Statuses the dev proxy returns while uvicorn is still binding its socket.
// Vite turns a refused/early-closed upstream connection into a 502/503/504, so
// these are boot-race signals (not real API errors) and are safe to retry.
const GATEWAY_BOOT = new Set([502, 503, 504]);

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // The API (uvicorn) can still be finishing startup when the web server is
  // already serving the page, so the first requests can hit a refused socket
  // (fetch throws a TypeError) OR the proxy can answer with a 502/503/504
  // before the backend is up. Retry both of those so the boot race never
  // surfaces; genuine HTTP errors (4xx, 500) are real and thrown immediately.
  const MAX = 8;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX; attempt++) {
    const isLast = attempt === MAX - 1;
    try {
      const res = await fetch(`${API_BASE}/api${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        if (GATEWAY_BOOT.has(res.status) && !isLast) {
          lastErr = new Error(`API ${res.status}`);
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`API ${res.status}: ${detail}`);
      }
      return res.json() as Promise<T>;
    } catch (e) {
      // A failed fetch (connection refused / network blip) throws a TypeError;
      // a real HTTP error throws our Error above and should NOT be retried.
      if (e instanceof TypeError && !isLast) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Disclaimer shown when AI analysis is asked for in an offline build (no LLM
// reachable). Mirrors the wording the backend returns when AI is unconfigured.
const AI_OFFLINE = {
  configured: false,
  text: null,
  error: "AI analysis needs an online connection.",
  disclaimer:
    "AI commentary is informational only and not investment advice. " +
    "It is unavailable in offline mode.",
};

// When LOCAL_DATA is on, the read endpoints are served from the published JSON
// bundle (see data/snapshot.ts) and saved screens live in localStorage — so the
// whole screener/chart/search flow works with no backend. Write/AI/account
// endpoints that genuinely need a server degrade gracefully. When LOCAL_DATA is
// off (the default) every call goes to the live API exactly as before.
export const api = {
  health: () =>
    LOCAL_DATA
      ? localHealth()
      : req<{ status: string; universe: number; provider?: string }>("/health"),
  fields: () => (LOCAL_DATA ? localFields() : req<FieldDef[]>("/fields")),
  segments: () => (LOCAL_DATA ? localSegments() : req<SegmentInfo[]>("/segments")),
  indices: () => (LOCAL_DATA ? localIndices() : req<IndicesResponse>("/indices")),
  searchSecurities: (q: string, limit = 8) =>
    LOCAL_DATA
      ? localSearch(q, limit)
      : req<Security[]>(`/securities?q=${encodeURIComponent(q)}&limit=${limit}`),
  metrics: (symbol: string) =>
    LOCAL_DATA
      ? localMetrics(symbol)
      : req<Metrics>(`/metrics/${encodeURIComponent(symbol)}`),
  aiAnalysis: (symbol: string) =>
    LOCAL_DATA
      ? Promise.resolve(AI_OFFLINE)
      : req<{ configured: boolean; text: string | null; error?: string; disclaimer: string }>(
          `/ai/analysis/${encodeURIComponent(symbol)}`,
        ),
  candles: (symbol: string, limit = 260) =>
    LOCAL_DATA
      ? localCandles(symbol, limit)
      : req<Candle[]>(`/candles/${encodeURIComponent(symbol)}?limit=${limit}`),
  screen: (body: ScreenRequest) =>
    LOCAL_DATA
      ? localScreen(body)
      : req<ScreenResponse>("/screen", { method: "POST", body: JSON.stringify(body) }),
  listScreens: () => (LOCAL_DATA ? localListScreens() : req<SavedScreen[]>("/screens")),
  saveScreen: (name: string, request: ScreenRequest) =>
    LOCAL_DATA
      ? localSaveScreen(name, request)
      : req<SavedScreen>("/screens", {
          method: "POST",
          body: JSON.stringify({ name, request }),
        }),
  deleteScreen: (id: string) =>
    LOCAL_DATA
      ? localDeleteScreen(id)
      : req<{ deleted: string }>(`/screens/${id}`, { method: "DELETE" }),
};
