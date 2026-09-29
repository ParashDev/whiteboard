// Reading and writing boards: the .whiteboard file, the clipboard payload and
// share links. Anything read from outside (a file, a link, the clipboard) goes
// through restoreElements, which rebuilds every element field by field so a
// malformed or hostile file can never put unexpected values into the scene.

import { DEFAULT_STYLES } from "./constants";
import { normalizeDraw, normalizeLinear } from "./elements";
import { round } from "./math";
import type {
  Arrowhead,
  BoardElement,
  BoardFile,
  CanvasPattern,
  DrawVariant,
  Edges,
  ElementType,
  FileMap,
  FillStyle,
  FontFamily,
  Roughness,
  StrokeStyle,
  StyleGroup,
  StyleProps,
  TextAlign,
  Vec,
} from "./types";

export const FILE_TYPE = "dplooy-whiteboard";
export const CLIPBOARD_TYPE = "dplooy-whiteboard/clipboard";
export const FILE_EXTENSION = ".whiteboard";
export const SHARE_PREFIX = "board=";
/** Links longer than this get truncated by chat apps and some browsers. */
export const SHARE_LIMIT = 60000;

export interface CanvasSettings {
  background: string;
  pattern: CanvasPattern;
}

export interface BoardData {
  elements: BoardElement[];
  files: FileMap;
  canvas?: CanvasSettings;
}

const ELEMENT_TYPES: ElementType[] = [
  "rectangle",
  "diamond",
  "ellipse",
  "triangle",
  "sticky",
  "arrow",
  "line",
  "draw",
  "text",
  "image",
];

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string, max = 20000): string => (typeof v === "string" ? v.slice(0, max) : fallback);
function oneOf<T extends string | number>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}
const color = (v: unknown, fallback: string): string =>
  typeof v === "string" && /^(transparent|#[0-9a-fA-F]{3,8})$/.test(v) ? v : fallback;

function styleGroupFor(type: ElementType, variant: unknown): StyleGroup {
  switch (type) {
    case "sticky":
      return "sticky";
    case "arrow":
      return "arrow";
    case "line":
      return "line";
    case "draw":
      return variant === "highlighter" ? "highlighter" : "pen";
    case "text":
      return "text";
    case "image":
      return "image";
    default:
      return "shape";
  }
}

export function restoreStyleProps(raw: unknown, d: StyleProps): StyleProps {
  return isObj(raw) ? restoreStyle(raw, d) : { ...d };
}

function restoreStyle(r: Raw, d: StyleProps): StyleProps {
  return {
    strokeColor: color(r.strokeColor, d.strokeColor),
    backgroundColor: color(r.backgroundColor, d.backgroundColor),
    fillStyle: oneOf<FillStyle>(r.fillStyle, ["solid", "hachure", "cross-hatch"], d.fillStyle),
    strokeWidth: Math.min(Math.max(num(r.strokeWidth, d.strokeWidth), 0.5), 16),
    strokeStyle: oneOf<StrokeStyle>(r.strokeStyle, ["solid", "dashed", "dotted"], d.strokeStyle),
    roughness: oneOf<Roughness>(r.roughness, [0, 1, 2], d.roughness),
    edges: oneOf<Edges>(r.edges, ["sharp", "round"], d.edges),
    opacity: Math.min(Math.max(num(r.opacity, d.opacity), 0), 100),
    fontFamily: oneOf<FontFamily>(r.fontFamily, ["hand", "sans", "mono"], d.fontFamily),
    fontSize: Math.min(Math.max(num(r.fontSize, d.fontSize), 4), 1000),
    textAlign: oneOf<TextAlign>(r.textAlign, ["left", "center", "right"], d.textAlign),
    startArrowhead: oneOf<Arrowhead>(r.startArrowhead, ["none", "arrow", "triangle", "dot", "bar"], d.startArrowhead),
    endArrowhead: oneOf<Arrowhead>(r.endArrowhead, ["none", "arrow", "triangle", "dot", "bar"], d.endArrowhead),
    curved: typeof r.curved === "boolean" ? r.curved : d.curved,
  };
}

function restorePoints(v: unknown): Vec[] | null {
  if (!Array.isArray(v) || v.length < 1) return null;
  const out: Vec[] = [];
  for (const p of v.slice(0, 5000)) {
    if (!Array.isArray(p)) return null;
    out.push([num(p[0], 0), num(p[1], 0)]);
  }
  return out;
}

function restoreElement(r: unknown): BoardElement | null {
  if (!isObj(r)) return null;
  const type = oneOf<ElementType>(r.type, ELEMENT_TYPES, "rectangle");
  if (r.type !== type) return null;
  const style = restoreStyle(r, DEFAULT_STYLES[styleGroupFor(type, r.variant)]);
  const common = {
    ...style,
    id: str(r.id, "", 64).replace(/[^a-zA-Z0-9_-]/g, "") || Math.random().toString(36).slice(2, 12),
    x: num(r.x, 0),
    y: num(r.y, 0),
    width: Math.max(0, num(r.width, 0)),
    height: Math.max(0, num(r.height, 0)),
    angle: type === "arrow" || type === "line" ? 0 : num(r.angle, 0),
    seed: Math.floor(num(r.seed, Math.random() * 2 ** 31)),
    groupIds: Array.isArray(r.groupIds) ? r.groupIds.filter((g): g is string => typeof g === "string").slice(0, 20) : [],
  };
  switch (type) {
    case "arrow":
    case "line": {
      const points = restorePoints(r.points);
      if (!points || points.length < 2) return null;
      const binding = (b: unknown) => (isObj(b) && typeof b.elementId === "string" ? { elementId: b.elementId } : null);
      return normalizeLinear({
        ...common,
        type,
        points,
        label: str(r.label, ""),
        startBinding: binding(r.startBinding),
        endBinding: binding(r.endBinding),
      });
    }
    case "draw": {
      if (!Array.isArray(r.points) || r.points.length < 1) return null;
      const points: [number, number, number][] = [];
      for (const p of r.points.slice(0, 20000)) {
        if (!Array.isArray(p)) return null;
        points.push([num(p[0], 0), num(p[1], 0), Math.min(Math.max(num(p[2], 0.5), 0), 1)]);
      }
      return normalizeDraw({
        ...common,
        type,
        points,
        variant: oneOf<DrawVariant>(r.variant, ["pen", "highlighter"], "pen"),
        simulatePressure: typeof r.simulatePressure === "boolean" ? r.simulatePressure : true,
      });
    }
    case "text":
      return { ...common, type, text: str(r.text, "") };
    case "image":
      return typeof r.fileId === "string" ? { ...common, type, fileId: r.fileId } : null;
    default:
      return { ...common, type, label: str(r.label, "") };
  }
}

export function restoreElements(raw: unknown): BoardElement[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardElement[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 20000)) {
    const el = restoreElement(r);
    if (!el || seen.has(el.id)) continue;
    seen.add(el.id);
    out.push(el);
  }
  return out;
}

export function restoreFiles(raw: unknown): FileMap {
  const out: FileMap = {};
  if (!isObj(raw)) return out;
  for (const [key, f] of Object.entries(raw)) {
    if (!isObj(f)) continue;
    const dataURL = str(f.dataURL, "", 50_000_000);
    const mimeType = str(f.mimeType, "", 64);
    if (!/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(dataURL)) continue;
    out[key] = { id: key, mimeType, dataURL } satisfies BoardFile;
  }
  return out;
}

export function restoreCanvas(raw: unknown): CanvasSettings | undefined {
  if (!isObj(raw)) return undefined;
  return {
    background: color(raw.background, "#ffffff"),
    pattern: oneOf<CanvasPattern>(raw.pattern, ["plain", "dots", "grid"], "plain"),
  };
}

/** Keep only the files that some element still references. */
export function usedFiles(elements: readonly BoardElement[], files: FileMap): FileMap {
  const out: FileMap = {};
  for (const el of elements) if (el.type === "image" && files[el.fileId]) out[el.fileId] = files[el.fileId];
  return out;
}

export function serializeBoard(data: BoardData): string {
  return JSON.stringify({
    type: FILE_TYPE,
    version: 1,
    source: "https://whiteboard.dplooy.com",
    elements: data.elements,
    files: usedFiles(data.elements, data.files),
    canvas: data.canvas,
  });
}

export function parseBoard(text: string): BoardData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a whiteboard file.");
  }
  if (!isObj(json) || json.type !== FILE_TYPE) throw new Error("This file isn't a whiteboard file.");
  const files = restoreFiles(json.files);
  const elements = restoreElements(json.elements).filter((el) => el.type !== "image" || files[el.fileId]);
  return { elements, files, canvas: restoreCanvas(json.canvas) };
}

// ─── Clipboard ──────────────────────────────────────────────────────────────

export function serializeClipboard(elements: readonly BoardElement[], files: FileMap): string {
  return JSON.stringify({ type: CLIPBOARD_TYPE, elements, files: usedFiles(elements, files) });
}

export function parseClipboard(text: string): BoardData | null {
  if (!text.includes(CLIPBOARD_TYPE)) return null;
  try {
    const json: unknown = JSON.parse(text);
    if (!isObj(json) || json.type !== CLIPBOARD_TYPE) return null;
    const files = restoreFiles(json.files);
    return { elements: restoreElements(json.elements).filter((el) => el.type !== "image" || files[el.fileId]), files };
  } catch {
    return null;
  }
}

// ─── Share links ────────────────────────────────────────────────────────────

function compactElement(el: BoardElement): BoardElement {
  const base = { ...el, x: round(el.x, 1), y: round(el.y, 1), width: round(el.width, 1), height: round(el.height, 1), angle: round(el.angle, 4) };
  if (base.type === "draw") {
    return { ...base, points: base.points.map(([x, y, p]) => [round(x, 1), round(y, 1), round(p, 2)] as [number, number, number]) };
  }
  if (base.type === "arrow" || base.type === "line") {
    return { ...base, points: base.points.map(([x, y]) => [round(x, 1), round(y, 1)] as Vec) };
  }
  return base;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function shareLinksSupported(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/** Everything except images, deflated into the URL fragment — which browsers never send to a server. */
export async function encodeShare(elements: readonly BoardElement[], canvas: CanvasSettings): Promise<{ payload: string; droppedImages: number }> {
  const kept = elements.filter((el) => el.type !== "image");
  const json = JSON.stringify({ type: FILE_TYPE, version: 1, elements: kept.map(compactElement), canvas });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return { payload: toBase64Url(bytes), droppedImages: elements.length - kept.length };
}

export async function decodeShare(payload: string): Promise<BoardData> {
  try {
    const bytes = fromBase64Url(payload);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const text = await new Response(stream).text();
    return parseBoard(text);
  } catch {
    throw new Error("This share link is incomplete or damaged.");
  }
}
