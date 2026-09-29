// Turns elements into cached paint operations. rough.js generates the sketchy
// geometry once per shape change; every frame after that only replays Path2D
// objects, so panning and moving are cheap. The same operations feed the SVG
// exporter through their `d` strings, so canvas and SVG never disagree.

import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";
import { getStroke } from "perfect-freehand";
import { freedrawSize } from "./constants";
import {
  bubbleBodyHeight,
  cylinderCap,
  delayRadius,
  isLinear,
  linearPath,
  shapePolygon,
  stadiumRadius,
  subroutineInset,
} from "./elements";
import type { Arrowhead, DrawElement, LinearElement, ShapeElement, Vec } from "./types";

export interface PaintOp {
  kind: "stroke" | "fill";
  d: string;
  path: Path2D;
  color: string;
  width: number;
  dash: number[] | null;
  rule: CanvasFillRule;
}

const generator = rough.generator();

function roughOptions(el: ShapeElement | LinearElement, fill: boolean): Options {
  const dashed = el.strokeStyle === "dashed";
  const dotted = el.strokeStyle === "dotted";
  // Arrows and lines are connectors: one stroke, with ends pinned exactly where
  // they are, so the shaft meets its arrowhead and the shape it is attached to.
  // (rough.js's double stroke read as two arrows at the Cartoonist setting.)
  const connector = el.type === "arrow" || el.type === "line";
  const o: Options = {
    seed: el.seed,
    roughness: el.roughness,
    bowing: el.roughness === 0 ? 0 : 1,
    stroke: el.strokeColor,
    strokeWidth: dashed || dotted ? el.strokeWidth + 0.5 : el.strokeWidth,
    disableMultiStroke: connector || dashed || dotted,
    preserveVertices: connector || el.roughness < 2,
    fillWeight: el.strokeWidth / 2,
    hachureGap: el.strokeWidth * 4,
  };
  if (connector && el.roughness > 0) {
    // With a single stroke, rough.js's default bow is ±2–4 px on a typical arrow —
    // the three levels looked identical. Connectors get their own, clearly
    // different amounts: Artist bows gently, Cartoonist bows and wobbles.
    o.bowing = el.roughness === 1 ? 1.8 : 2.6;
    o.maxRandomnessOffset = el.roughness === 1 ? 2.8 : 3.6;
  }
  if (dashed) o.strokeLineDash = [8, 8 + el.strokeWidth];
  if (dotted) o.strokeLineDash = [1.5, 6 + el.strokeWidth];
  if (fill && el.backgroundColor !== "transparent") {
    o.fill = el.backgroundColor;
    o.fillStyle = el.fillStyle;
  }
  // Tiny shapes look scribbled at full roughness; ease it off.
  const size = Math.min(Math.abs(el.width), Math.abs(el.height));
  if (size < 20 && el.roughness > 0 && el.type !== "arrow" && el.type !== "line") o.roughness = (o.roughness ?? 1) / 2;
  return o;
}

function toOps(drawable: Drawable): PaintOp[] {
  const o = drawable.options;
  const ops: PaintOp[] = [];
  for (const set of drawable.sets) {
    const d = generator.opsToPath(set, 2);
    if (set.type === "path") {
      ops.push({
        kind: "stroke",
        d,
        path: new Path2D(d),
        color: o.stroke,
        width: o.strokeWidth,
        dash: o.strokeLineDash ?? null,
        rule: "nonzero",
      });
    } else if (set.type === "fillPath") {
      const evenodd = drawable.shape === "curve" || drawable.shape === "polygon" || drawable.shape === "path";
      ops.push({
        kind: "fill",
        d,
        path: new Path2D(d),
        color: o.fill ?? "transparent",
        width: 0,
        dash: null,
        rule: evenodd ? "evenodd" : "nonzero",
      });
    } else {
      ops.push({
        kind: "stroke",
        d,
        path: new Path2D(d),
        color: o.fill ?? "transparent",
        width: o.fillWeight < 0 ? o.strokeWidth / 2 : o.fillWeight,
        dash: null,
        rule: "nonzero",
      });
    }
  }
  // rough.js already emits the fill set before the outline, so order is kept.
  return ops;
}

/**
 * A polygon with each corner rounded by a quadratic curve. Zero-length edges (a
 * shape with no width or height yet) are skipped: dividing by their length gave
 * NaN, which rough.js cannot parse, and that failure blanked the whole canvas.
 */
function roundedPolygonPath(points: Vec[], radius: number): string {
  const pts = points.filter((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6;
  });
  const n = pts.length;
  if (n < 3) return "";
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const lenPrev = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const lenNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const r = Math.max(0, Math.min(radius, lenPrev / 2, lenNext / 2));
    const a: Vec = [cur[0] + ((prev[0] - cur[0]) / lenPrev) * r, cur[1] + ((prev[1] - cur[1]) / lenPrev) * r];
    const b: Vec = [cur[0] + ((next[0] - cur[0]) / lenNext) * r, cur[1] + ((next[1] - cur[1]) / lenNext) * r];
    d += `${i === 0 ? "M" : "L"}${a[0]} ${a[1]} Q${cur[0]} ${cur[1]} ${b[0]} ${b[1]} `;
  }
  return d + "Z";
}

const K = 0.5523; // Bézier handle length for a quarter circle

function cylinderBodyPath(w: number, h: number): string {
  const ry = cylinderCap(w, h);
  const hw = w / 2;
  return [
    `M0 ${ry} L0 ${h - ry}`,
    `C0 ${h - ry + ry * K} ${hw - hw * K} ${h} ${hw} ${h}`,
    `C${hw + hw * K} ${h} ${w} ${h - ry + ry * K} ${w} ${h - ry}`,
    `L${w} ${ry}`,
    `C${w} ${ry - ry * K} ${hw + hw * K} 0 ${hw} 0`,
    `C${hw - hw * K} 0 0 ${ry - ry * K} 0 ${ry} Z`,
  ].join(" ");
}

/** A cloud drawn in a 100 × 60 design box, stretched to the element. */
function cloudPath(w: number, h: number): string {
  const segs: number[][] = [
    [22, 60],
    [8, 60, 2, 50, 7, 41],
    [0, 31, 9, 20, 21, 23],
    [22, 10, 36, 3, 48, 10],
    [55, 1, 74, 1, 80, 13],
    [93, 11, 102, 25, 95, 36],
    [102, 45, 96, 60, 82, 60],
  ];
  const X = (v: number) => Math.round((v / 100) * w * 100) / 100;
  const Y = (v: number) => Math.round(((v - 3) / 57) * h * 100) / 100;
  let d = `M${X(segs[0][0])} ${Y(segs[0][1])}`;
  for (const s of segs.slice(1)) d += ` C${X(s[0])} ${Y(s[1])} ${X(s[2])} ${Y(s[3])} ${X(s[4])} ${Y(s[5])}`;
  return `${d} Z`;
}

/** A pill: straight top and bottom, fully round ends (the flowchart start/end symbol). */
function terminatorPath(w: number, h: number): string {
  const r = stadiumRadius(w, h);
  const ry = h / 2;
  return [
    `M${r} 0 L${w - r} 0`,
    `C${w - r + r * K} 0 ${w} ${ry - ry * K} ${w} ${ry}`,
    `C${w} ${ry + ry * K} ${w - r + r * K} ${h} ${w - r} ${h}`,
    `L${r} ${h}`,
    `C${r - r * K} ${h} 0 ${ry + ry * K} 0 ${ry}`,
    `C0 ${ry - ry * K} ${r - r * K} 0 ${r} 0 Z`,
  ].join(" ");
}

/** Flat left side, round right side (the flowchart delay symbol). */
function delayPath(w: number, h: number): string {
  const r = delayRadius(w, h);
  const ry = h / 2;
  return [
    `M0 0 L${w - r} 0`,
    `C${w - r + r * K} 0 ${w} ${ry - ry * K} ${w} ${ry}`,
    `C${w} ${ry + ry * K} ${w - r + r * K} ${h} ${w - r} ${h}`,
    `L0 ${h} Z`,
  ].join(" ");
}

/** A page with a wavy bottom edge (the flowchart document symbol). */
function documentPath(w: number, h: number): string {
  return `M0 0 L${w} 0 L${w} ${h * 0.84} C${w * 0.62} ${h * 0.66} ${w * 0.38} ${h * 1.1} 0 ${h * 0.88} Z`;
}

/** Rounded (or square) body with a sharp tail at the bottom left. */
function bubblePath(w: number, h: number, round: boolean): string {
  const b = bubbleBodyHeight(h);
  const r = round ? Math.min(16, w * 0.1, b * 0.25) : 0;
  return [
    `M${r} 0 L${w - r} 0 Q${w} 0 ${w} ${r}`,
    `L${w} ${b - r} Q${w} ${b} ${w - r} ${b}`,
    `L${w * 0.36} ${b} L${w * 0.1} ${h} L${w * 0.18} ${b}`,
    `L${r} ${b} Q0 ${b} 0 ${b - r}`,
    `L0 ${r} Q0 0 ${r} 0 Z`,
  ].join(" ");
}

function shapeOps(el: ShapeElement): PaintOp[] {
  const w = el.width;
  const h = el.height;
  // The first frame of a drag has no size yet; there is nothing to draw.
  if (!(w >= 1 && h >= 1)) return [];
  const o = roughOptions(el, true);
  let drawable: Drawable;
  switch (el.type) {
    case "ellipse":
      drawable = generator.ellipse(w / 2, h / 2, w, h, o);
      break;
    case "diamond": {
      const pts: Vec[] = [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
      drawable =
        el.edges === "round"
          ? generator.path(roundedPolygonPath(pts, Math.min(w, h) * 0.12), o)
          : generator.polygon(pts, o);
      break;
    }
    case "triangle": {
      const pts: Vec[] = [
        [w / 2, 0],
        [w, h],
        [0, h],
      ];
      drawable =
        el.edges === "round"
          ? generator.path(roundedPolygonPath(pts, Math.min(w, h) * 0.1), o)
          : generator.polygon(pts, o);
      break;
    }
    case "parallelogram":
    case "hexagon":
    case "star":
    case "manualinput":
    case "trapezoid":
    case "offpage": {
      const pts = shapePolygon(el);
      const radius = Math.min(w, h) * (el.type === "star" ? 0.035 : 0.08);
      drawable = el.edges === "round" ? generator.path(roundedPolygonPath(pts, radius), o) : generator.polygon(pts, o);
      break;
    }
    case "terminator":
      drawable = generator.path(terminatorPath(w, h), o);
      break;
    case "delay":
      drawable = generator.path(delayPath(w, h), o);
      break;
    case "document":
      drawable = generator.path(documentPath(w, h), o);
      break;
    case "subroutine": {
      // A process box with a bar down each side.
      const inset = subroutineInset(w);
      const box = el.edges === "round" ? generator.path(roundedPolygonPath(shapePolygon(el), Math.min(12, Math.min(w, h) * 0.12)), o) : generator.rectangle(0, 0, w, h, o);
      const bar = { ...o, fill: undefined };
      return [...toOps(box), ...toOps(generator.line(inset, 0, inset, h, bar)), ...toOps(generator.line(w - inset, 0, w - inset, h, bar))];
    }
    case "actor": {
      // A stick figure: the head takes the fill, the body is lines.
      const d = Math.min(w * 0.5, h * 0.26);
      const line = { ...o, fill: undefined };
      return [
        ...toOps(generator.circle(w / 2, d / 2, d, o)),
        ...toOps(generator.line(w / 2, d, w / 2, h * 0.64, line)),
        ...toOps(generator.line(w * 0.08, h * 0.38, w * 0.92, h * 0.38, line)),
        ...toOps(
          generator.linearPath(
            [
              [w * 0.12, h],
              [w / 2, h * 0.64],
              [w * 0.88, h],
            ],
            line,
          ),
        ),
      ];
    }
    case "bubble":
      drawable = generator.path(bubblePath(w, h, el.edges === "round"), o);
      break;
    case "cloud":
      drawable = generator.path(cloudPath(w, h), o);
      break;
    case "cylinder":
      // The body (sides, bottom curve, back of the rim), then the rim drawn over it.
      return [...toOps(generator.path(cylinderBodyPath(w, h), o)), ...toOps(generator.ellipse(w / 2, cylinderCap(w, h), w, cylinderCap(w, h) * 2, o))];
    default: {
      if (el.edges === "round") {
        const r = Math.min(24, Math.min(w, h) * 0.25);
        drawable = generator.path(
          roundedPolygonPath(
            [
              [0, 0],
              [w, 0],
              [w, h],
              [0, h],
            ],
            r,
          ),
          o,
        );
      } else drawable = generator.rectangle(0, 0, w, h, o);
    }
  }
  return toOps(drawable);
}

function arrowheadOps(el: LinearElement, tip: Vec, from: Vec, head: Arrowhead): PaintOp[] {
  if (head === "none") return [];
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const segLen = Math.hypot(tip[0] - from[0], tip[1] - from[1]);
  const size = Math.min(10 + el.strokeWidth * 4, Math.max(8, segLen * 0.5));
  // Heads are always solid, single-stroke and a little calmer than the shaft, so they stay crisp.
  const o: Options = { ...roughOptions(el, false), strokeLineDash: undefined, roughness: Math.min(el.roughness, 1) };
  const at = (a: number, len: number): Vec => [tip[0] - Math.cos(a) * len, tip[1] - Math.sin(a) * len];
  switch (head) {
    case "arrow": {
      const spread = Math.PI / 7;
      return toOps(generator.linearPath([at(angle - spread, size), tip, at(angle + spread, size)], o));
    }
    case "triangle": {
      const spread = Math.PI / 8;
      return toOps(
        generator.polygon([tip, at(angle - spread, size), at(angle + spread, size)], {
          ...o,
          fill: el.strokeColor,
          fillStyle: "solid",
        }),
      );
    }
    case "dot": {
      const r = Math.max(4, size * 0.32);
      const c = at(angle, r);
      return toOps(generator.circle(c[0], c[1], r * 2, { ...o, fill: el.strokeColor, fillStyle: "solid" }));
    }
    case "bar": {
      const half = size * 0.55;
      const nx = Math.cos(angle + Math.PI / 2) * half;
      const ny = Math.sin(angle + Math.PI / 2) * half;
      return toOps(generator.line(tip[0] - nx, tip[1] - ny, tip[0] + nx, tip[1] + ny, o));
    }
  }
}

function linearOps(el: LinearElement): PaintOp[] {
  const pts = el.points;
  const o = roughOptions(el, false);
  const drawable =
    el.curved && pts.length > 2
      ? generator.curve(pts.map((p) => [p[0], p[1]] as [number, number]), o)
      : generator.linearPath(pts.map((p) => [p[0], p[1]] as [number, number]), o);
  const ops = toOps(drawable);
  if (pts.length >= 2) {
    const path = linearPath(el);
    const end = path[path.length - 1];
    const beforeEnd = pickDirectionPoint(path, path.length - 1, -1);
    const start = path[0];
    const afterStart = pickDirectionPoint(path, 0, 1);
    ops.push(...arrowheadOps(el, end, beforeEnd, el.endArrowhead));
    ops.push(...arrowheadOps(el, start, afterStart, el.startArrowhead));
  }
  return ops;
}

/** Walk away from an endpoint until the path has moved far enough to give a stable direction. */
function pickDirectionPoint(path: Vec[], index: number, step: 1 | -1): Vec {
  const origin = path[index];
  let i = index + step;
  while (i >= 0 && i < path.length) {
    if (Math.hypot(path[i][0] - origin[0], path[i][1] - origin[1]) > 6) return path[i];
    i += step;
  }
  const fallback = path[index + step] ?? path[index];
  return fallback === origin ? [origin[0] - step, origin[1]] : fallback;
}

// ─── Freehand ───────────────────────────────────────────────────────────────

export function freedrawOutline(el: DrawElement): number[][] {
  const size = freedrawSize(el.variant, el.strokeWidth);
  const highlighter = el.variant === "highlighter";
  return getStroke(el.points, {
    size,
    thinning: highlighter ? 0 : 0.6,
    smoothing: 0.5,
    streamline: highlighter ? 0.4 : 0.5,
    simulatePressure: highlighter ? false : el.simulatePressure,
    last: true,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  });
}

/** Outline points → smooth closed SVG path (quadratic curves through midpoints). */
export function outlineToPath(points: number[][]): string {
  if (points.length === 0) return "";
  const r = (n: number) => Math.round(n * 100) / 100;
  let d = `M${r(points[0][0])} ${r(points[0][1])} Q`;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d += `${r(x0)} ${r(y0)} ${r((x0 + x1) / 2)} ${r((y0 + y1) / 2)} `;
  }
  return d + "Z";
}

function drawOps(el: DrawElement): PaintOp[] {
  const d = outlineToPath(freedrawOutline(el));
  if (!d) return [];
  return [{ kind: "fill", d, path: new Path2D(d), color: el.strokeColor, width: 0, dash: null, rule: "nonzero" }];
}

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  points: unknown;
  ops: PaintOp[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(el: ShapeElement | LinearElement | DrawElement): string {
  return [
    el.type,
    el.width,
    el.height,
    el.strokeColor,
    el.backgroundColor,
    el.fillStyle,
    el.strokeWidth,
    el.strokeStyle,
    el.roughness,
    el.edges,
    el.seed,
    el.startArrowhead,
    el.endArrowhead,
    el.curved,
  ].join("|");
}

export function getPaintOps(el: ShapeElement | LinearElement | DrawElement): PaintOp[] {
  const key = cacheKey(el);
  const points = "points" in el ? el.points : null;
  const hit = cache.get(el.id);
  if (hit && hit.key === key && hit.points === points) return hit.ops;
  let ops: PaintOp[];
  if (el.type === "draw") ops = drawOps(el);
  else if (isLinear(el)) ops = linearOps(el);
  else ops = shapeOps(el);
  cache.set(el.id, { key, points, ops });
  if (cache.size > 5000) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return ops;
}
