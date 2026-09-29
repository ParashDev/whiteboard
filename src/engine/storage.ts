// Autosave. The board lives in this browser's IndexedDB (images can be large,
// which rules out localStorage); small UI preferences live in localStorage.
// Nothing here ever talks to a server.

import { openDB, type IDBPDatabase } from "idb";
import { restoreElements, restoreFiles, type CanvasSettings } from "./serialize";
import type { BoardElement, FileMap, StyleGroup, StyleProps, Viewport } from "./types";

const DB_NAME = "whiteboard";
const STORE = "boards";
const KEY = "current";

export interface SavedBoard {
  elements: BoardElement[];
  files: FileMap;
  viewport?: Viewport;
  savedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      // Schema only, synchronously: async work here can outlive the upgrade transaction.
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function loadBoard(): Promise<SavedBoard | null> {
  const raw: unknown = await (await db()).get(STORE, KEY);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const files = restoreFiles(r.files);
  const elements = restoreElements(r.elements).filter((el) => el.type !== "image" || files[el.fileId]);
  const v = r.viewport as Record<string, unknown> | undefined;
  const viewport =
    v && typeof v.x === "number" && typeof v.y === "number" && typeof v.zoom === "number" && v.zoom > 0
      ? { x: v.x, y: v.y, zoom: v.zoom }
      : undefined;
  return { elements, files, viewport, savedAt: typeof r.savedAt === "number" ? r.savedAt : 0 };
}

export async function saveBoard(board: SavedBoard): Promise<void> {
  await (await db()).put(STORE, board, KEY);
}

// ─── Viewport ───────────────────────────────────────────────────────────────
// Kept apart from the board so panning never rewrites the whole board.

const VIEWPORT_KEY = "whiteboard:viewport:v1";

export function saveViewport(v: Viewport): void {
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify({ x: v.x, y: v.y, zoom: v.zoom }));
  } catch {
    // Storage blocked: the view simply isn't remembered.
  }
}

export function loadViewport(): Viewport | undefined {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return undefined;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return undefined;
    const { x, y, zoom } = v as Record<string, unknown>;
    return typeof x === "number" && typeof y === "number" && typeof zoom === "number" && zoom > 0 && Number.isFinite(x + y + zoom)
      ? { x, y, zoom }
      : undefined;
  } catch {
    return undefined;
  }
}

// ─── Preferences ────────────────────────────────────────────────────────────

const PREFS_KEY = "whiteboard:prefs:v1";

export interface Prefs {
  theme: "light" | "dark";
  canvas: CanvasSettings;
  snap: boolean;
  styles: Partial<Record<StyleGroup, StyleProps>>;
}

export function loadPrefs(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<Prefs>) : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked (private mode): preferences just don't persist.
  }
}
