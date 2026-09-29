import { freedrawSize } from "./constants";
import { getCenter, isBindable, isLinear, layoutLinearLabel, linearPath, shapePolygon } from "./elements";
import { distanceToPolyline, pointInPolygon, rotatePoint } from "./math";
import type { BoardElement, Vec } from "./types";

/** World point → the element's unrotated local space (origin at its top-left). */
export function toLocal(el: BoardElement, x: number, y: number): Vec {
  if (isLinear(el)) return [x - el.x, y - el.y];
  const [cx, cy] = getCenter(el);
  const [rx, ry] = rotatePoint(x, y, cx, cy, -el.angle);
  return [rx - el.x, ry - el.y];
}

function ellipseHit(w: number, h: number, lx: number, ly: number, filled: boolean, tol: number): boolean {
  const a = Math.max(w / 2, 0.5);
  const b = Math.max(h / 2, 0.5);
  const nx = (lx - a) / a;
  const ny = (ly - b) / b;
  const d = Math.hypot(nx, ny);
  if (filled && d <= 1) return true;
  return Math.abs(d - 1) * Math.min(a, b) <= tol;
}

function closedPolylineDistance(px: number, py: number, poly: Vec[]): number {
  return distanceToPolyline(px, py, [...poly, poly[0]]);
}

/** Is world point (x, y) on the element? `tol` is in world units. */
export function hitTestElement(el: BoardElement, x: number, y: number, tol: number): boolean {
  const [lx, ly] = toLocal(el, x, y);
  switch (el.type) {
    case "rectangle":
    case "diamond":
    case "triangle":
    case "ellipse": {
      const filled = el.backgroundColor !== "transparent" || el.label.trim() !== "";
      const strokeTol = tol + el.strokeWidth / 2;
      if (el.type === "ellipse") return ellipseHit(el.width, el.height, lx, ly, filled, strokeTol);
      const poly = shapePolygon(el);
      if (filled && pointInPolygon(lx, ly, poly)) return true;
      return closedPolylineDistance(lx, ly, poly) <= strokeTol;
    }
    case "sticky":
    case "text":
    case "image":
      return lx >= -tol && ly >= -tol && lx <= el.width + tol && ly <= el.height + tol;
    case "arrow":
    case "line": {
      if (distanceToPolyline(lx, ly, linearPath(el)) <= tol + el.strokeWidth / 2) return true;
      if (!el.label) return false;
      const l = layoutLinearLabel(el);
      return Math.abs(lx - l.cx) <= l.width / 2 + 6 && Math.abs(ly - l.cy) <= l.height / 2 + 4;
    }
    case "draw": {
      const pts = el.points.map((p) => [p[0], p[1]] as Vec);
      return distanceToPolyline(lx, ly, pts) <= tol + freedrawSize(el.variant, el.strokeWidth) / 2;
    }
  }
}

export function getElementAtPoint(
  elements: readonly BoardElement[],
  x: number,
  y: number,
  tol: number,
  filter?: (el: BoardElement) => boolean,
): BoardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (filter && !filter(el)) continue;
    if (hitTestElement(el, x, y, tol)) return el;
  }
  return null;
}

/** Inside the element's (rotated) bounding box. */
export function pointInElementBox(el: BoardElement, x: number, y: number, pad: number): boolean {
  const [lx, ly] = toLocal(el, x, y);
  return lx >= -pad && ly >= -pad && lx <= el.width + pad && ly <= el.height + pad;
}

/** Inside a bindable element's outline, or within `tol` of it — where an arrow end snaps on. */
export function isOverBindable(el: BoardElement, x: number, y: number, tol: number): boolean {
  if (!isBindable(el)) return false;
  const [lx, ly] = toLocal(el, x, y);
  if (el.type === "ellipse") return ellipseHit(el.width, el.height, lx, ly, true, tol);
  const poly = shapePolygon(el);
  return pointInPolygon(lx, ly, poly) || closedPolylineDistance(lx, ly, poly) <= tol;
}
