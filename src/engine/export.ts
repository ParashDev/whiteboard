// PNG and SVG export. PNG reuses the live renderer on an offscreen canvas; SVG
// is written as markup from the same cached paint operations, with the three
// board fonts embedded so the file looks identical anywhere it is opened.

import kalamUrl from "@fontsource/kalam/files/kalam-latin-400-normal.woff2?url";
import geistUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import monoUrl from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";
import { FONT_STACKS, LINE_HEIGHT } from "./constants";
import { getCenter, getElementBounds, isLinear, layoutLinearLabel, layoutShapeLabel } from "./elements";
import { emptyBounds, extendBounds } from "./math";
import { ImageStore, renderScene } from "./render";
import { usedFiles } from "./serialize";
import { getPaintOps, type PaintOp } from "./shape";
import type { BoardElement, Bounds, FileMap, FontFamily, ShapeElement, TextAlign } from "./types";

export interface ExportOptions {
  elements: readonly BoardElement[];
  files: FileMap;
  /** Solid background colour, or null for transparent. */
  background: string | null;
  scale: number;
  padding?: number;
}

const MAX_SIDE = 16384;
const MAX_AREA = 120_000_000;

function exportBounds(elements: readonly BoardElement[]): Bounds {
  const b = emptyBounds();
  for (const el of elements) {
    const e = getElementBounds(el, el.strokeWidth + 2);
    extendBounds(b, e.minX, e.minY);
    extendBounds(b, e.maxX, e.maxY);
    if (isLinear(el) && el.label) {
      const l = layoutLinearLabel(el);
      extendBounds(b, l.worldX - l.width / 2 - 8, l.worldY - l.height / 2 - 4);
      extendBounds(b, l.worldX + l.width / 2 + 8, l.worldY + l.height / 2 + 4);
    }
    if (el.type === "sticky") extendBounds(b, e.maxX + 8, e.maxY + 18);
  }
  return b;
}

export async function exportToCanvas(opts: ExportOptions): Promise<HTMLCanvasElement> {
  const pad = opts.padding ?? 24;
  const b = exportBounds(opts.elements);
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  let scale = opts.scale;
  scale = Math.min(scale, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  const images = new ImageStore();
  const files = usedFiles(opts.elements, opts.files);
  await images.ensure(files);
  renderScene(ctx, opts.elements, {
    viewport: { x: b.minX - pad, y: b.minY - pad, zoom: 1 },
    width: w,
    height: h,
    pixelRatio: scale,
    background: opts.background,
    pattern: "plain",
    images,
    files,
  });
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be created."))), type);
  });
}

export async function exportPngBlob(opts: ExportOptions): Promise<Blob> {
  return canvasToBlob(await exportToCanvas(opts));
}

// ─── SVG ────────────────────────────────────────────────────────────────────

const FONT_URLS: Record<FontFamily, { url: string; name: string }> = {
  hand: { url: kalamUrl, name: "Kalam" },
  sans: { url: geistUrl, name: "Geist Variable" },
  mono: { url: monoUrl, name: "JetBrains Mono Variable" },
};

const fontDataCache = new Map<FontFamily, Promise<string | null>>();

function fontDataUrl(family: FontFamily): Promise<string | null> {
  let hit = fontDataCache.get(family);
  if (!hit) {
    hit = fetch(FONT_URLS[family].url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("font"))))
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => null);
    fontDataCache.set(family, hit);
  }
  return hit;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const n = (v: number) => Math.round(v * 100) / 100;

function opsToSvg(ops: readonly PaintOp[]): string {
  return ops
    .map((op) =>
      op.kind === "fill"
        ? `<path d="${op.d}" fill="${op.color}"${op.rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`
        : `<path d="${op.d}" fill="none" stroke="${op.color}" stroke-width="${n(op.width)}" stroke-linecap="round" stroke-linejoin="round"${
            op.dash ? ` stroke-dasharray="${op.dash.join(" ")}"` : ""
          }/>`,
    )
    .join("");
}

function textToSvg(lines: readonly string[], family: FontFamily, size: number, color: string, align: TextAlign, left: number, top: number, width: number): string {
  const lh = size * LINE_HEIGHT;
  const x = align === "left" ? left : align === "center" ? left + width / 2 : left + width;
  const anchor = align === "left" ? "start" : align === "center" ? "middle" : "end";
  const spans = lines
    .map((line, i) => `<text x="${n(x)}" y="${n(top + lh * i + lh / 2)}">${esc(line)}</text>`)
    .join("");
  return `<g font-family="${esc(FONT_STACKS[family])}" font-size="${n(size)}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central" style="white-space:pre">${spans}</g>`;
}

export async function exportToSvg(opts: ExportOptions): Promise<string> {
  const pad = opts.padding ?? 24;
  const b = exportBounds(opts.elements);
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const ox = pad - b.minX;
  const oy = pad - b.minY;
  const files = usedFiles(opts.elements, opts.files);
  const defs: string[] = [];
  const body: string[] = [];

  const families = new Set<FontFamily>();
  let hasSticky = false;

  opts.elements.forEach((el, index) => {
    const opacity = el.opacity < 100 ? ` opacity="${el.opacity / 100}"` : "";
    let transform: string;
    if (isLinear(el)) transform = `translate(${n(el.x + ox)} ${n(el.y + oy)})`;
    else {
      const [cx, cy] = getCenter(el);
      transform = `translate(${n(cx + ox)} ${n(cy + oy)})${el.angle ? ` rotate(${n((el.angle * 180) / Math.PI)})` : ""} translate(${n(-el.width / 2)} ${n(-el.height / 2)})`;
    }
    let inner = "";
    const shapeLabel = (shape: ShapeElement) => {
      if (!shape.label) return "";
      families.add(shape.fontFamily);
      const l = layoutShapeLabel(shape);
      return textToSvg(l.lines, shape.fontFamily, shape.fontSize, shape.strokeColor, shape.textAlign, l.cx - l.width / 2, l.cy - l.height / 2, l.width);
    };
    switch (el.type) {
      case "sticky": {
        hasSticky = true;
        const r = el.edges === "round" ? Math.min(14, Math.min(el.width, el.height) * 0.08) : 2;
        inner += `<rect width="${n(el.width)}" height="${n(el.height)}" rx="${n(r)}" fill="${el.backgroundColor === "transparent" ? "#fff3a3" : el.backgroundColor}" filter="url(#sticky-shadow)"/>`;
        inner += shapeLabel(el);
        break;
      }
      case "arrow":
      case "line":
        inner += opsToSvg(getPaintOps(el));
        if (el.label) {
          families.add(el.fontFamily);
          const l = layoutLinearLabel(el);
          if (opts.background) {
            inner += `<rect x="${n(l.cx - l.width / 2 - 6)}" y="${n(l.cy - l.height / 2 - 3)}" width="${n(l.width + 12)}" height="${n(l.height + 6)}" fill="${opts.background}"/>`;
          }
          inner += textToSvg(l.lines, el.fontFamily, el.fontSize, el.strokeColor, "center", l.cx - l.width / 2, l.cy - l.height / 2, l.width);
        }
        break;
      case "draw":
        inner += opsToSvg(getPaintOps(el));
        break;
      case "text":
        families.add(el.fontFamily);
        inner += textToSvg(el.text.split("\n"), el.fontFamily, el.fontSize, el.strokeColor, el.textAlign, 0, 0, el.width);
        break;
      case "image": {
        const file = files[el.fileId];
        if (!file) break;
        let clip = "";
        if (el.edges === "round") {
          const id = `clip-${index}`;
          const r = Math.min(16, Math.min(el.width, el.height) * 0.08);
          defs.push(`<clipPath id="${id}"><rect width="${n(el.width)}" height="${n(el.height)}" rx="${n(r)}"/></clipPath>`);
          clip = ` clip-path="url(#${id})"`;
        }
        inner += `<image href="${file.dataURL}" width="${n(el.width)}" height="${n(el.height)}" preserveAspectRatio="none"${clip}/>`;
        break;
      }
      default:
        // Every shape type — deliberately not a list, so a new shape is never left out.
        inner += opsToSvg(getPaintOps(el)) + shapeLabel(el);
    }
    body.push(`<g transform="${transform}"${opacity}>${inner}</g>`);
  });

  if (hasSticky) {
    defs.push(
      `<filter id="sticky-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#0f172a" flood-opacity="0.16"/></filter>`,
    );
  }
  const faces = await Promise.all(
    [...families].map(async (f) => {
      const data = await fontDataUrl(f);
      return data ? `@font-face{font-family:"${FONT_URLS[f].name}";src:url(${data}) format("woff2");}` : "";
    }),
  );
  const style = faces.filter(Boolean).join("");
  if (style) defs.unshift(`<style>${style}</style>`);

  const bg = opts.background ? `<rect width="100%" height="100%" fill="${opts.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">${
    defs.length ? `<defs>${defs.join("")}</defs>` : ""
  }${bg}${body.join("")}</svg>`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function clipboardImagesSupported(): boolean {
  return typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
}

/** Safari only allows clipboard writes whose data is still a pending promise inside the click. */
export async function copyPngToClipboard(makeBlob: () => Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": makeBlob() })]);
}
