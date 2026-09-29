import type { Bounds, Vec } from "./types";

export function rotatePoint(x: number, y: number, cx: number, cy: number, angle: number): Vec {
  if (angle === 0) return [x, y];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToPolyline(px: number, py: number, pts: readonly Vec[]): number {
  if (pts.length === 1) return Math.hypot(px - pts[0][0], py - pts[0][1]);
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distanceToSegment(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < min) min = d;
  }
  return min;
}

export function pointInPolygon(px: number, py: number, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function extendBounds(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
  );
}

export function isFiniteBounds(b: Bounds): boolean {
  return Number.isFinite(b.minX) && Number.isFinite(b.maxX) && Number.isFinite(b.minY) && Number.isFinite(b.maxY);
}

/** Sample a Catmull-Rom spline through the points (what "curved" arrows draw). */
export function catmullRom(pts: readonly Vec[], segments = 12): Vec[] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]] as Vec);
  const out: Vec[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** The point halfway along a polyline, by length. */
export function polylineMidpoint(pts: readonly Vec[]): Vec {
  if (pts.length === 1) return [pts[0][0], pts[0][1]];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  let remaining = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = distance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (remaining <= seg && seg > 0) {
      const t = remaining / seg;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    remaining -= seg;
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1]];
}

export function snapAngle(dx: number, dy: number, step = Math.PI / 12): Vec {
  const len = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return [Math.cos(angle) * len, Math.sin(angle) * len];
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
