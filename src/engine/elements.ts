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

/** General-purpose shapes, in menu order. */
export const BASIC_SHAPES: readonly ShapeType[] = ["rectangle", "ellipse", "diamond", "triangle", "hexagon", "star", "cloud", "bubble"];

/** Flowchart symbols and system-diagram pieces, in menu order. */
export const DIAGRAM_SHAPES: readonly ShapeType[] = [
  "terminator",
  "parallelogram",
  "document",
  "subroutine",
  "manualinput",
  "trapezoid",
  "delay",
  "offpage",
  "cylinder",
  "actor",
];

/** Every drawable shape tool. */
export const SHAPE_TYPES: readonly ShapeType[] = [...BASIC_SHAPES, ...DIAGRAM_SHAPES];

const SHAPE_SET = new Set<string>([...SHAPE_TYPES, "sticky"]);

export function isShapeType(type: string): type is ShapeType {
  return type !== "sticky" && SHAPE_SET.has(type);
}

export function isShape(el: BoardElement): el is ShapeElement {
  return SHAPE_SET.has(el.type);
}

/** Round shapes use the ellipse maths for hit-testing and arrow attachment. */
export function isRoundShape(el: BoardElement): boolean {
  return el.type === "ellipse" || el.type === "cloud";
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

// Elements are immutable, so an element object's bounds never change: compute once.
const boundsCache = new WeakMap<BoardElement, Bounds>();

/** Axis-aligned world bounds, including rotation. `pad` grows it for culling. */
export function getElementBounds(el: BoardElement, pad = 0): Bounds {
  let b = boundsCache.get(el);
  if (!b) {
    b = computeBounds(el);
    boundsCache.set(el, b);
  }
  return pad ? { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad } : { ...b };
}

function computeBounds(el: BoardElement): Bounds {
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
    case "parallelogram": {
      const s = parallelogramSkew(w, h);
      return [
        [s, 0],
        [w, 0],
        [w - s, h],
        [0, h],
      ];
    }
    case "hexagon":
      return [
        [w * 0.25, 0],
        [w * 0.75, 0],
        [w, h / 2],
        [w * 0.75, h],
        [w * 0.25, h],
        [0, h / 2],
      ];
    case "star":
      return starPoints(w, h);
    case "bubble": {
      const b = bubbleBodyHeight(h);
      return [
        [0, 0],
        [w, 0],
        [w, b],
        [w * 0.36, b],
        [w * 0.1, h],
        [w * 0.18, b],
        [0, b],
      ];
    }
    case "terminator": {
      const r = stadiumRadius(w, h);
      return [
        ...arcPoints(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2),
        ...arcPoints(r, h / 2, r, h / 2, Math.PI / 2, (Math.PI * 3) / 2),
      ];
    }
    case "delay": {
      const r = delayRadius(w, h);
      return [[0, 0], ...arcPoints(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2), [0, h]];
    }
    case "document":
      return [
        [0, 0],
        [w, 0],
        [w, h * 0.84],
        [w * 0.5, h * 0.9],
        [0, h * 0.9],
      ];
    case "manualinput":
      return [
        [0, h * 0.28],
        [w, 0],
        [w, h],
        [0, h],
      ];
    case "trapezoid": {
      const s = trapezoidInset(w, h);
      return [
        [0, 0],
        [w, 0],
        [w - s, h],
        [s, h],
      ];
    }
    case "offpage":
      return [
        [0, 0],
        [w, 0],
        [w, h * 0.64],
        [w / 2, h],
        [0, h * 0.64],
      ];
    default:
      // Rectangles, sticky notes, text, images, cylinders, subroutines and actors use their box.
      return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
  }
}

export function parallelogramSkew(w: number, h: number): number {
  return Math.min(w * 0.22, h * 0.6);
}

/** Radius of the terminator's rounded ends (a pill: fully round ends). */
export function stadiumRadius(w: number, h: number): number {
  return Math.min(h / 2, w / 2);
}

/** Radius of the delay shape's round right side. */
export function delayRadius(w: number, h: number): number {
  return Math.min(h / 2, w);
}

/** Distance of the predefined-process side bars from the edges. */
export function subroutineInset(w: number): number {
  return Math.max(6, Math.min(18, w * 0.1));
}

export function trapezoidInset(w: number, h: number): number {
  return Math.min(w * 0.2, h * 0.6);
}

/** Points along an elliptical arc (angles in radians, clockwise from +x). */
function arcPoints(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 10): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Half-height of the cylinder's top and bottom ellipses. */
export function cylinderCap(w: number, h: number): number {
  return Math.min(h * 0.14, w * 0.22);
}

/** The speech bubble's body; the tail fills the rest of the height. */
export function bubbleBodyHeight(h: number): number {
  return h * 0.8;
}

/** A five-pointed star stretched to fill the box exactly (top tip at 0, bottom tips at h). */
export function starPoints(w: number, h: number): Vec[] {
  const ry = h / (1 + Math.cos(Math.PI / 5));
  const rx = w / (2 * Math.sin((2 * Math.PI) / 5));
  const pts: Vec[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.45 : 1;
    pts.push([w / 2 + Math.cos(a) * rx * r, ry + Math.sin(a) * ry * r]);
  }
  return pts;
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
    case "parallelogram":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w - parallelogramSkew(w, h) * 2 - p) };
    case "hexagon":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w * 0.75 - p) };
    case "star":
      return { cx: w / 2, cy: (h / (1 + Math.cos(Math.PI / 5))) * 1.04, width: Math.max(10, w * 0.36) };
    case "cylinder":
      return { cx: w / 2, cy: h / 2 + cylinderCap(w, h) / 2, width: Math.max(10, w - p * 2) };
    case "cloud":
      return { cx: w / 2, cy: h * 0.56, width: Math.max(10, w * 0.6) };
    case "bubble":
      return { cx: w / 2, cy: bubbleBodyHeight(h) / 2, width: Math.max(10, w - p * 2) };
    case "terminator":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w - stadiumRadius(w, h) * 0.8 - p) };
    case "delay": {
      const r = delayRadius(w, h);
      return { cx: (w - r * 0.4) / 2, cy: h / 2, width: Math.max(10, w - r * 0.4 - p * 2) };
    }
    case "document":
      return { cx: w / 2, cy: h * 0.43, width: Math.max(10, w - p * 2) };
    case "subroutine":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w - subroutineInset(w) * 2 - p) };
    case "manualinput":
      return { cx: w / 2, cy: h * 0.62, width: Math.max(10, w - p * 2) };
    case "trapezoid":
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w - trapezoidInset(w, h) * 2 - p) };
    case "offpage":
      return { cx: w / 2, cy: h * 0.36, width: Math.max(10, w - p * 2) };
    case "actor":
      // The name sits under the figure, like a UML actor; the centre is set per layout.
      return { cx: w / 2, cy: h, width: Math.max(60, w * 2) };
    default:
      return { cx: w / 2, cy: h / 2, width: Math.max(10, w - p * 2) };
  }
}

/** How much of a shape's height its label may use (the rest is outline). */
const LABEL_HEIGHT_SHARE: Partial<Record<ShapeElement["type"], number>> = {
  ellipse: 1 / Math.SQRT2,
  diamond: 0.5,
  triangle: 0.5,
  hexagon: 0.9,
  star: 0.34,
  cylinder: 0.75,
  cloud: 0.55,
  bubble: 0.8,
  document: 0.8,
  manualinput: 0.7,
  offpage: 0.6,
};

export function layoutShapeLabel(el: ShapeElement): LabelLayout {
  const area = labelArea(el);
  const lines = wrapText(el.label, el.fontFamily, el.fontSize, area.width);
  const lineHeight = el.fontSize * LINE_HEIGHT;
  const height = lines.length * lineHeight;
  // An actor's name hangs below the figure instead of inside it.
  const cy = el.type === "actor" ? el.height + 6 + height / 2 : area.cy;
  return { lines, lineHeight, cx: area.cx, cy, width: area.width, height };
}

/** Height a shape needs so its label fits inside it. */
export function heightForLabel(el: ShapeElement): number {
  if (!el.label || el.type === "actor") return el.height;
  const { height } = layoutShapeLabel(el);
  return (height + LABEL_PADDING * 2) / (LABEL_HEIGHT_SHARE[el.type] ?? 1);
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
