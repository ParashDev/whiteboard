// Scene renderer shared by the live canvas, PNG export and the landing-page
// previews. It draws in world space: the caller supplies a viewport and the
// renderer handles culling, device pixel ratio and the background pattern.

import { GRID_SIZE, LINE_HEIGHT } from "./constants";
import { getCenter, getElementBounds, isLinear, layoutLinearLabel, layoutShapeLabel } from "./elements";
import { boundsIntersect } from "./math";
import { getPaintOps, type PaintOp } from "./shape";
import { fontString } from "./text";
import type {
  BoardElement,
  BoardFile,
  CanvasPattern,
  FileMap,
  FontFamily,
  ImageElement,
  ShapeElement,
  TextAlign,
  Viewport,
} from "./types";

export class ImageStore {
  private entries = new Map<string, { img: HTMLImageElement; src: string; ready: boolean; failed: boolean }>();

  constructor(private onLoad?: () => void) {}

  get(file: BoardFile | undefined): HTMLImageElement | null {
    if (!file) return null;
    let entry = this.entries.get(file.id);
    if (!entry || entry.src !== file.dataURL) {
      const img = new Image();
      const created = { img, src: file.dataURL, ready: false, failed: false };
      img.onload = () => {
        created.ready = true;
        this.onLoad?.();
      };
      img.onerror = () => {
        created.failed = true;
      };
      img.src = file.dataURL;
      this.entries.set(file.id, created);
      entry = created;
    }
    return entry.ready ? entry.img : null;
  }

  /** Resolve once every image the files map references has decoded (or failed). */
  async ensure(files: FileMap): Promise<void> {
    await Promise.all(
      Object.values(files).map(async (file) => {
        this.get(file);
        const entry = this.entries.get(file.id);
        if (!entry || entry.ready || entry.failed) return;
        try {
          await entry.img.decode();
          entry.ready = true;
        } catch {
          entry.failed = true;
        }
      }),
    );
  }
}

export interface SceneRenderOptions {
  viewport: Viewport;
  /** CSS pixel size of the area being drawn. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  pixelRatio: number;
  /** Solid page colour, or null to leave the canvas transparent. */
  background: string | null;
  pattern: CanvasPattern;
  images: ImageStore;
  files: FileMap;
  hiddenIds?: ReadonlySet<string>;
  hiddenLabelIds?: ReadonlySet<string>;
  fadedIds?: ReadonlySet<string>;
  /** Pre-invert images so the dark-mode canvas filter shows them in true colour. */
  darkMode?: boolean;
}

export function renderScene(ctx: CanvasRenderingContext2D, elements: readonly BoardElement[], opts: SceneRenderOptions): void {
  const { viewport: v, width, height, pixelRatio } = opts;
  ctx.save();
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  } else ctx.clearRect(0, 0, width, height);
  if (opts.pattern !== "plain") drawPattern(ctx, opts.pattern, v, width, height);

  const s = pixelRatio * v.zoom;
  ctx.setTransform(s, 0, 0, s, -v.x * s, -v.y * s);
  const view = { minX: v.x, minY: v.y, maxX: v.x + width / v.zoom, maxY: v.y + height / v.zoom };
  for (const el of elements) {
    if (opts.hiddenIds?.has(el.id)) continue;
    if (!boundsIntersect(getElementBounds(el, 40 + el.strokeWidth), view)) continue;
    renderElement(ctx, el, opts);
  }
  ctx.restore();
}

export function renderElement(ctx: CanvasRenderingContext2D, el: BoardElement, opts: SceneRenderOptions): void {
  ctx.save();
  ctx.globalAlpha = (el.opacity / 100) * (opts.fadedIds?.has(el.id) ? 0.2 : 1);
  if (isLinear(el)) {
    ctx.translate(el.x, el.y);
  } else {
    const [cx, cy] = getCenter(el);
    ctx.translate(cx, cy);
    if (el.angle) ctx.rotate(el.angle);
    ctx.translate(-el.width / 2, -el.height / 2);
  }

  const showLabel = !opts.hiddenLabelIds?.has(el.id);
  switch (el.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "triangle":
      paintOps(ctx, getPaintOps(el));
      if (showLabel) drawShapeLabel(ctx, el);
      break;
    case "sticky":
      drawSticky(ctx, el, opts.pixelRatio * opts.viewport.zoom);
      if (showLabel) drawShapeLabel(ctx, el);
      break;
    case "arrow":
    case "line": {
      paintOps(ctx, getPaintOps(el));
      if (showLabel && el.label) {
        const l = layoutLinearLabel(el);
        if (opts.background) {
          ctx.fillStyle = opts.background;
          ctx.fillRect(l.cx - l.width / 2 - 6, l.cy - l.height / 2 - 3, l.width + 12, l.height + 6);
        }
        drawTextLines(ctx, l.lines, el.fontFamily, el.fontSize, el.strokeColor, "center", l.cx - l.width / 2, l.cy - l.height / 2, l.width);
      }
      break;
    }
    case "draw":
      paintOps(ctx, getPaintOps(el));
      break;
    case "text":
      drawTextLines(ctx, el.text.split("\n"), el.fontFamily, el.fontSize, el.strokeColor, el.textAlign, 0, 0, el.width);
      break;
    case "image":
      drawImage(ctx, el, opts);
      break;
  }
  ctx.restore();
}

export function paintOps(ctx: CanvasRenderingContext2D, ops: readonly PaintOp[]): void {
  for (const op of ops) {
    if (op.kind === "fill") {
      ctx.fillStyle = op.color;
      ctx.fill(op.path, op.rule);
    } else {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(op.dash ?? []);
      ctx.stroke(op.path);
    }
  }
  ctx.setLineDash([]);
}

export function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  family: FontFamily,
  size: number,
  color: string,
  align: TextAlign,
  left: number,
  top: number,
  width: number,
): void {
  ctx.font = fontString(family, size);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = align;
  const lh = size * LINE_HEIGHT;
  const x = align === "left" ? left : align === "center" ? left + width / 2 : left + width;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, top + lh * i + lh / 2);
}

function drawShapeLabel(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
  if (!el.label) return;
  const l = layoutShapeLabel(el);
  drawTextLines(ctx, l.lines, el.fontFamily, el.fontSize, el.strokeColor, el.textAlign, l.cx - l.width / 2, l.cy - l.height / 2, l.width);
}

function drawSticky(ctx: CanvasRenderingContext2D, el: ShapeElement, deviceScale: number): void {
  const r = el.edges === "round" ? Math.min(14, Math.min(el.width, el.height) * 0.08) : 2;
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 14 * deviceScale;
  ctx.shadowOffsetY = 5 * deviceScale;
  ctx.fillStyle = el.backgroundColor === "transparent" ? "#fff3a3" : el.backgroundColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, el.width, el.height, r);
  ctx.fill();
  ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement, opts: SceneRenderOptions): void {
  const img = opts.images.get(opts.files[el.fileId]);
  const r = el.edges === "round" ? Math.min(16, Math.min(el.width, el.height) * 0.08) : 0;
  ctx.save();
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, el.width, el.height, r);
    ctx.clip();
  }
  if (img) {
    if (opts.darkMode) ctx.filter = "invert(100%) hue-rotate(180deg)";
    ctx.drawImage(img, 0, 0, el.width, el.height);
  } else {
    ctx.fillStyle = "#f1f3f5";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.strokeStyle = "#ced4da";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, el.width - 1, el.height - 1);
  }
  ctx.restore();
}

function drawPattern(ctx: CanvasRenderingContext2D, pattern: CanvasPattern, v: Viewport, width: number, height: number): void {
  let step = GRID_SIZE * v.zoom;
  let every = 1;
  while (step < 12) {
    step *= 5;
    every *= 5;
  }
  const worldStep = GRID_SIZE * every;
  const firstX = Math.ceil(v.x / worldStep) * worldStep;
  const firstY = Math.ceil(v.y / worldStep) * worldStep;
  const toScreenX = (wx: number) => (wx - v.x) * v.zoom;
  const toScreenY = (wy: number) => (wy - v.y) * v.zoom;

  if (pattern === "dots") {
    ctx.fillStyle = "#c3c8d0";
    const size = v.zoom > 0.6 ? 1.6 : 1.2;
    ctx.beginPath();
    for (let wx = firstX; toScreenX(wx) <= width; wx += worldStep) {
      const sx = toScreenX(wx);
      for (let wy = firstY; toScreenY(wy) <= height; wy += worldStep) {
        ctx.rect(sx - size / 2, toScreenY(wy) - size / 2, size, size);
      }
    }
    ctx.fill();
    return;
  }

  // Grid: minor lines every step, a stronger line every fifth.
  ctx.lineWidth = 1;
  const drawLines = (major: boolean) => {
    ctx.beginPath();
    for (let wx = firstX; toScreenX(wx) <= width; wx += worldStep) {
      const isMajor = Math.round(wx / worldStep) % 5 === 0;
      if (isMajor !== major) continue;
      const sx = Math.round(toScreenX(wx)) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let wy = firstY; toScreenY(wy) <= height; wy += worldStep) {
      const isMajor = Math.round(wy / worldStep) % 5 === 0;
      if (isMajor !== major) continue;
      const sy = Math.round(toScreenY(wy)) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = "#eceef2";
  drawLines(false);
  ctx.strokeStyle = "#dfe3e8";
  drawLines(true);
}
