import { LABEL_PADDING, LINE_HEIGHT, freedrawSize } from "./constants";
import { catmullRom, emptyBounds, extendBounds, polylineMidpoint, rotatePoint } from "./math";
import { measureText, wrapText } from "./text";
import type {
  BoardElement,
  Bounds,
  DrawElement,
  DrawVariant,
  ImageElement,
  LinearElement,
  LinearType,
  ShapeElement,
  ShapeType,
  StyleProps,
  TextElement,
  Vec,
} from "./types";

export function randomId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function base(style: StyleProps) {
  return { ...style, id: randomId(), angle: 0, seed: randomSeed(), groupIds: [] as string[] };
}

export function newShape(
  type: ShapeType | "sticky",
  x: number,
  y: number,
  width: number,
  height: number,
  style: StyleProps,
  label = "",
): ShapeElement {
  return { ...base(style), type, x, y, width, height, label };
}

export function newLinear(type: LinearType, x: number, y: number, points: Vec[], style: StyleProps): LinearElement {
  return normalizeLinear({
    ...base(style),
    type,
    x,
    y,
    width: 0,
    height: 0,
    points,
    label: "",
    startBinding: null,
    endBinding: null,
  });
}

export function newDraw(
  x: number,
  y: number,
  points: [number, number, number][],
  variant: DrawVariant,
  simulatePressure: boolean,
  style: StyleProps,
): DrawElement {
  return { ...base(style), type: "draw", x, y, width: 0, height: 0, points, variant, simulatePressure };
}

export function newText(x: number, y: number, text: string, style: StyleProps): TextElement {
  const size = measureText(text || " ", style.fontFamily, style.fontSize);
  return { ...base(style), type: "text", x, y, width: size.width, height: size.height, text };
}

export function newImage(x: number, y: number, width: number, height: number, fileId: string, style: StyleProps): ImageElement {
  return { ...base(style), type: "image", x, y, width, height, fileId };
}

// ─── Kind checks ────────────────────────────────────────────────────────────

export function isLinear(el: BoardElement): el is LinearElement {
  return el.type === "arrow" || el.type === "line";
}

export function isShape(el: BoardElement): el is ShapeElement {
  return (
    el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse" || el.type === "triangle" || el.type === "sticky"
  );
}

/** Elements an arrow end can attach to. */
export function isBindable(el: BoardElement): boolean {
  return isShape(el) || el.type === "text" || el.type === "image";
}

export function hasLabel(el: BoardElement): el is ShapeElement | LinearElement {
  return isShape(el) || isLinear(el);
}

/** Text elements and images keep their aspect ratio when resized from a corner. */
export function keepsAspect(el: BoardElement): boolean {
  return el.type === "text" || el.type === "image";
}

// ─── Geometry ───────────────────────────────────────────────────────────────

export function getCenter(el: BoardElement): Vec {
  return [el.x + el.width / 2, el.y + el.height / 2];
}

/** Points of a linear element in world space (arrows are never rotated). */
export function linearWorldPoints(el: LinearElement): Vec[] {
  return el.points.map(([px, py]) => [el.x + px, el.y + py] as Vec);
}

/** The path a linear element actually draws, in local coordinates. */
export function linearPath(el: LinearElement): Vec[] {
  return el.curved && el.points.length > 2 ? catmullRom(el.points) : el.points;
}

export function normalizeLinear(el: LinearElement): LinearElement {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of el.points) {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  if (minX === 0 && minY === 0 && el.width === maxX - minX && el.height === maxY - minY) return el;
  return {
    ...el,
    x: el.x + minX,
    y: el.y + minY,
    width: maxX - minX,
    height: maxY - minY,
    points: el.points.map(([px, py]) => [px - minX, py - minY] as Vec),
  };
}

export function normalizeDraw(el: DrawElement): DrawElement {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of el.points) {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  if (minX === 0 && minY === 0 && el.width === maxX - minX && el.height === maxY - minY) return el;
  return {
    ...el,
    x: el.x + minX,
    y: el.y + minY,
    width: maxX - minX,
    height: maxY - minY,
    points: el.points.map(([px, py, p]) => [px - minX, py - minY, p] as [number, number, number]),
  };
}

/** Axis-aligned world bounds, including rotation. `pad` grows it for culling. */
export function getElementBounds(el: BoardElement, pad = 0): Bounds {
  const b = emptyBounds();
  if (isLinear(el)) {
    for (const [px, py] of linearPath(el)) extendBounds(b, el.x + px, el.y + py);
  } else if (el.type === "draw") {
    const [cx, cy] = getCenter(el);
    const r = freedrawSize(el.variant, el.strokeWidth) / 2;
    for (const [px, py] of el.points) {
      const [wx, wy] = rotatePoint(el.x + px, el.y + py, cx, cy, el.angle);
      extendBounds(b, wx - r, wy - r);
      extendBounds(b, wx + r, wy + r);
    }
  } else {
    const [cx, cy] = getCenter(el);
    for (const [px, py] of [
      [el.x, el.y],
      [el.x + el.width, el.y],
      [el.x + el.width, el.y + el.height],
      [el.x, el.y + el.height],
    ] as Vec[]) {
      const [wx, wy] = rotatePoint(px, py, cx, cy, el.angle);
      extendBounds(b, wx, wy);
    }
  }
  if (!Number.isFinite(b.minX)) {
    extendBounds(b, el.x, el.y);
  }
  b.minX -= pad;
  b.minY -= pad;
  b.maxX += pad;
  b.maxY += pad;
  return b;
}

export function getCommonBounds(elements: readonly BoardElement[]): Bounds {
  const b = emptyBounds();
  for (const el of elements) {
    const e = getElementBounds(el);
    extendBounds(b, e.minX, e.minY);
    extendBounds(b, e.maxX, e.maxY);
  }
  return b;
}

/** Outline polygon of a closed shape in local coordinates (ellipses excluded). */
export function shapePolygon(el: BoardElement): Vec[] {
  const w = el.width;
  const h = el.height;
  switch (el.type) {
    case "diamond":
      return [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
    case "triangle":
      return [
        [w / 2, 0],
        [w, h],
        [0, h],
      ];
    default:
      return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
  }
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export interface LabelLayout {
  lines: string[];
  lineHeight: number;
  /** Local-space centre the label block is laid out around. */
  cx: number;
  cy: number;
  /** Width lines wrap to, and the block's total height. */
  width: number;
  height: number;
}

/** Where a shape's label sits: the largest box that comfortably fits inside the outline. */
export function labelArea(el: ShapeElement): { cx: number; cy: number; width: number } {
  const w = el.width;
  const h = el.height;
  const p = LABEL_PADDING;
  switch (el.type) {
    case "ellipse":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w / Math.SQRT2 - p) };
    case "diamond":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w / 2 - p / 2) };
    case "triangle":
      return { cx: w / 2, cy: h * 0.64, width: Math.max(10, w * 0.5 - p) };
    default:
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w - p * 2) };
  }
}

export function layoutShapeLabel(el: ShapeElement): LabelLayout {
  const area = labelArea(el);
  const lines = wrapText(el.label, el.fontFamily, el.fontSize, area.width);
  const lineHeight = el.fontSize * LINE_HEIGHT;
  return { lines, lineHeight, cx: area.cx, cy: area.cy, width: area.width, height: lines.length * lineHeight };
}

/** Height a shape needs so its label fits inside it. */
export function heightForLabel(el: ShapeElement): number {
  if (!el.label) return el.height;
  const { height } = layoutShapeLabel(el);
  const p = LABEL_PADDING * 2;
  switch (el.type) {
    case "ellipse":
      return (height + p) * Math.SQRT2;
    case "diamond":
    case "triangle":
      return (height + p) * 2;
    default:
      return height + p;
  }
}

/** Grow a shape (downwards from its centre) until the label fits. Never shrinks. */
export function fitShapeToLabel(el: ShapeElement): ShapeElement {
  const needed = heightForLabel(el);
  if (needed <= el.height) return el;
  const grow = needed - el.height;
  return { ...el, y: el.y - grow / 2, height: needed };
}

export function layoutLinearLabel(el: LinearElement): LabelLayout & { worldX: number; worldY: number } {
  const lines = el.label.split("\n");
  const size = measureText(el.label, el.fontFamily, el.fontSize);
  const [mx, my] = polylineMidpoint(linearPath(el));
  const lineHeight = el.fontSize * LINE_HEIGHT;
  return {
    lines,
    lineHeight,
    cx: mx,
    cy: my,
    width: size.width,
    height: lines.length * lineHeight,
    worldX: el.x + mx,
    worldY: el.y + my,
  };
}

/** Re-measure a text element after its text or font changed, keeping its alignment edge fixed. */
export function remeasureText(el: TextElement): TextElement {
  const size = measureText(el.text || " ", el.fontFamily, el.fontSize);
  if (size.width === el.width && size.height === el.height) return el;
  let x = el.x;
  if (el.textAlign === "center") x = el.x + (el.width - size.width) / 2;
  else if (el.textAlign === "right") x = el.x + el.width - size.width;
  return { ...el, x, width: size.width, height: size.height };
}
