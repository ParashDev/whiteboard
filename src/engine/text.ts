import { FONT_STACKS, LINE_HEIGHT } from "./constants";
import type { FontFamily } from "./types";

export function fontString(family: FontFamily, size: number): string {
  return `${size}px ${FONT_STACKS[family]}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d");
    if (!measureCtx) throw new Error("Canvas 2D is not available in this browser.");
  }
  return measureCtx;
}

export function measureLine(line: string, family: FontFamily, size: number): number {
  const c = ctx();
  c.font = fontString(family, size);
  return c.measureText(line).width;
}

/** Size of unwrapped text (lines break only where the user pressed Enter). */
export function measureText(text: string, family: FontFamily, size: number): { width: number; height: number } {
  const lines = text.split("\n");
  let width = 0;
  for (const line of lines) width = Math.max(width, measureLine(line, family, size));
  return { width: Math.ceil(width), height: Math.ceil(lines.length * size * LINE_HEIGHT) };
}

const wrapCache = new Map<string, string[]>();

/** Greedy word wrap to a maximum width; words longer than the width break by character. */
export function wrapText(text: string, family: FontFamily, size: number, maxWidth: number): string[] {
  const key = `${family}|${size}|${Math.round(maxWidth)}|${text}`;
  const hit = wrapCache.get(key);
  if (hit) return hit;
  const out: string[] = [];
  const limit = Math.max(1, maxWidth);
  const fits = (s: string) => measureLine(s, family, size) <= limit;
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const token of paragraph.split(/(\s+)/)) {
      if (token === "") continue;
      if (fits(line + token)) {
        line += token;
        continue;
      }
      if (line.trim() !== "") {
        out.push(line.trimEnd());
        line = "";
      }
      if (/^\s+$/.test(token)) continue;
      if (fits(token)) {
        line = token;
        continue;
      }
      // A single word wider than the line breaks by character.
      for (const ch of token) {
        if (!fits(line + ch) && line !== "") {
          out.push(line);
          line = ch;
        } else line += ch;
      }
    }
    out.push(line.trimEnd());
  }
  if (wrapCache.size > 800) wrapCache.clear();
  wrapCache.set(key, out);
  return out;
}

export function lineHeightPx(size: number): number {
  return size * LINE_HEIGHT;
}

/** Wait (at most a few seconds) for the three board fonts, so text measures correctly. */
export async function loadBoardFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const families: FontFamily[] = ["hand", "sans", "mono"];
  const loads = Promise.all(families.map((f) => document.fonts.load(fontString(f, 20), "Aa").catch(() => [])));
  const timeout = new Promise((resolve) => setTimeout(resolve, 3500));
  await Promise.race([loads, timeout]);
}

export function clearTextCaches(): void {
  wrapCache.clear();
}
