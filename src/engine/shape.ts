// Turns elements into cached paint operations. rough.js generates the sketchy
// geometry once per shape change; every frame after that only replays Path2D
// objects, so panning and moving are cheap. The same operations feed the SVG
// exporter through their `d` strings, so canvas and SVG never disagree.

import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";
import { getStroke } from "perfect-freehand";
import { freedrawSize } from "./constants";
import { isLinear, linearPath } from "./elements";
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
  const o: Options = {
    seed: el.seed,
    roughness: el.roughness === 2 ? 2 : el.roughness,
    bowing: el.roughness === 0 ? 0 : 1,
    stroke: el.strokeColor,
    strokeWidth: dashed || dotted ? el.strokeWidth + 0.5 : el.strokeWidth,
    disableMultiStroke: dashed || dotted,
    preserveVertices: el.roughness < 2,
    fillWeight: el.strokeWidth / 2,
    hachureGap: el.strokeWidth * 4,
  };
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

/** A polygon with each corner rounded by a quadratic curve. */
function roundedPolygonPath(points: Vec[], radius: number): string {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const lenPrev = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const lenNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const r = Math.min(radius, lenPrev / 2, lenNext / 2);
    const a: Vec = [cur[0] + ((prev[0] - cur[0]) / lenPrev) * r, cur[1] + ((prev[1] - cur[1]) / lenPrev) * r];
    const b: Vec = [cur[0] + ((next[0] - cur[0]) / lenNext) * r, cur[1] + ((next[1] - cur[1]) / lenNext) * r];
    d += `${i === 0 ? "M" : "L"}${a[0]} ${a[1]} Q${cur[0]} ${cur[1]} ${b[0]} ${b[1]} `;
  }
  return d + "Z";
}

function shapeOps(el: ShapeElement): PaintOp[] {
  const w = el.width;
  const h = el.height;
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
  const o: Options = { ...roughOptions(el, false), strokeLineDash: undefined, disableMultiStroke: false };
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
