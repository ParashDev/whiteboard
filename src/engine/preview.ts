// Paint a board, fitted and centred, into a canvas at its CSS size — used for
// the template picker and export preview in the app and the pictures on the
// static pages. Drawing at display size (not exporting and scaling an image)
// keeps it to a few milliseconds.

import { getCommonBounds } from "./elements";
import { ImageStore, renderScene } from "./render";
import type { BoardElement, CanvasPattern, FileMap } from "./types";

const sharedImages = new ImageStore();

export function paintPreview(
  canvas: HTMLCanvasElement,
  elements: readonly BoardElement[],
  opts: {
    pad?: number;
    /** Extra room kept clear at the top (e.g. under a toolbar drawn over the picture). */
    insetTop?: number;
    pattern?: CanvasPattern;
    maxZoom?: number;
    /** Solid page colour, or null for transparent. Defaults to white. */
    background?: string | null;
    files?: FileMap;
    images?: ImageStore;
  } = {},
): void {
  const ctx = canvas.getContext("2d");
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!ctx || !w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (!elements.length) return;
  const b = getCommonBounds(elements);
  const pad = opts.pad ?? 28;
  const top = opts.insetTop ?? 0;
  // Fit into the area below the inset, centred there.
  const availH = Math.max(1, h - top);
  const zoom = Math.min(w / (b.maxX - b.minX + pad * 2), availH / (b.maxY - b.minY + pad * 2), opts.maxZoom ?? 1.15);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  renderScene(ctx, elements, {
    viewport: { x: cx - w / 2 / zoom, y: cy - (top + availH / 2) / zoom, zoom },
    width: w,
    height: h,
    pixelRatio: dpr,
    background: opts.background === undefined ? "#ffffff" : opts.background,
    pattern: opts.pattern ?? "dots",
    images: opts.images ?? sharedImages,
    files: opts.files ?? {},
  });
}
