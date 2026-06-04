// Device-local Saved Screens for the on-device (LOCAL_DATA) build. The hosted
// app persists saved screens server-side, per user; with no backend they live in
// localStorage instead. The shape and behaviour mirror the server contract
// (backend/app/store.py) so the Saved page and Screener save flow work
// unchanged: same SavedScreen fields, same 200-item cap, same "not found" error.

import type { SavedScreen, ScreenRequest } from "../api/types";

const KEY = "taureye.screens.local";
const MAX = 200; // mirrors MAX_SCREENS_PER_USER

function load(): SavedScreen[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedScreen[]) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedScreen[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — saves simply won't persist */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function localListScreens(): Promise<SavedScreen[]> {
  return load();
}

export async function localSaveScreen(
  name: string,
  request: ScreenRequest,
): Promise<SavedScreen> {
  const list = load();
  if (list.length >= MAX) {
    throw new Error(
      `Saved-screen limit reached (${MAX}). Delete some before saving more.`,
    );
  }
  const screen: SavedScreen = {
    id: uid(),
    name,
    request,
    created_at: new Date().toISOString(),
  };
  list.push(screen);
  persist(list);
  return screen;
}

export async function localDeleteScreen(
  id: string,
): Promise<{ deleted: string }> {
  const list = load();
  const kept = list.filter((s) => s.id !== id);
  if (kept.length === list.length) {
    throw new Error("Screen not found");
  }
  persist(kept);
  return { deleted: id };
}
