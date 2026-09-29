// Arrows whose ends are attached to shapes. An attached end always sits on the
// shape's outline, on the line from the shape's centre towards the arrow's
// neighbouring point, so moving, resizing or rotating the shape drags the
// arrow along and keeps it pointing at the shape.

import { BINDING_GAP } from "./constants";
import { getCenter, isBindable, isLinear, isRoundShape, linearWorldPoints, normalizeLinear, shapePolygon } from "./elements";
import { isOverBindable } from "./hittest";
import { rotatePoint } from "./math";
import type { BoardElement, LinearElement, Vec } from "./types";

export function getBindableAt(
  elements: readonly BoardElement[],
  x: number,
  y: number,
  tol: number,
  excludeId?: string,
): BoardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === excludeId || !isBindable(el)) continue;
    if (isOverBindable(el, x, y, tol)) return el;
  }
  return null;
}

/** Point on the element's outline in the direction of (towardX, towardY), pushed out by a small gap. */
export function outlinePointToward(el: BoardElement, towardX: number, towardY: number): Vec | null {
  const [cx, cy] = getCenter(el);
  const [tx, ty] = rotatePoint(towardX, towardY, cx, cy, -el.angle);
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  let t: number;
  if (isRoundShape(el)) {
    const a = Math.max(el.width / 2, 0.5);
    const b = Math.max(el.height / 2, 0.5);
    t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
  } else {
    // Ray from the centre against each polygon edge; the nearest positive hit is the outline.
    const poly = shapePolygon(el).map(([px, py]) => [el.x + px, el.y + py] as Vec);
    t = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const ex = bx - ax;
      const ey = by - ay;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const s = ((ax - cx) * ey - (ay - cy) * ex) / denom;
      const u = ((ax - cx) * dy - (ay - cy) * dx) / denom;
      if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6 && s < t) t = s;
    }
    if (!Number.isFinite(t)) return null;
  }
  const gap = BINDING_GAP + (el.type === "text" || el.type === "image" || el.type === "sticky" ? 0 : el.strokeWidth / 2);
  const ux = dx / len;
  const uy = dy / len;
  const px = cx + dx * t + ux * gap;
  const py = cy + dy * t + uy * gap;
  return rotatePoint(px, py, cx, cy, el.angle);
}

/** Recompute an arrow's attached ends from the current positions of the shapes it is bound to. */
export function applyBindings(arrow: LinearElement, byId: ReadonlyMap<string, BoardElement>): LinearElement {
  const startEl = arrow.startBinding ? byId.get(arrow.startBinding.elementId) : undefined;
  const endEl = arrow.endBinding ? byId.get(arrow.endBinding.elementId) : undefined;
  if (!startEl && !endEl) {
    if (arrow.startBinding || arrow.endBinding) return { ...arrow, startBinding: null, endBinding: null };
    return arrow;
  }
  const pts = linearWorldPoints(arrow);
  const n = pts.length;
  const startRef = n > 2 ? pts[1] : endEl ? getCenter(endEl) : pts[n - 1];
  const endRef = n > 2 ? pts[n - 2] : startEl ? getCenter(startEl) : pts[0];
  if (startEl) {
    const p = outlinePointToward(startEl, startRef[0], startRef[1]);
    if (p) pts[0] = p;
  }
  if (endEl) {
    const p = outlinePointToward(endEl, endRef[0], endRef[1]);
    if (p) pts[n - 1] = p;
  }
  return normalizeLinear({
    ...arrow,
    x: 0,
    y: 0,
    points: pts,
    startBinding: startEl ? arrow.startBinding : null,
    endBinding: endEl ? arrow.endBinding : null,
  });
}

/** After the elements in `changed` moved or reshaped, drag every arrow attached to them along. */
export function updateBoundArrows(elements: BoardElement[], changed: ReadonlySet<string>): BoardElement[] {
  if (changed.size === 0) return elements;
  let byId: Map<string, BoardElement> | null = null;
  let out: BoardElement[] | null = null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!isLinear(el)) continue;
    const s = el.startBinding?.elementId;
    const e = el.endBinding?.elementId;
    if (!(s && changed.has(s)) && !(e && changed.has(e))) continue;
    byId ??= new Map(elements.map((x) => [x.id, x]));
    const next = applyBindings(el, byId);
    if (next !== el) {
      out ??= elements.slice();
      out[i] = next;
    }
  }
  return out ?? elements;
}

/** Drop bindings that point at elements which no longer exist. */
export function pruneBindings(elements: BoardElement[]): BoardElement[] {
  const ids = new Set(elements.map((e) => e.id));
  let out: BoardElement[] | null = null;
  elements.forEach((el, i) => {
    if (!isLinear(el)) return;
    const s = el.startBinding && !ids.has(el.startBinding.elementId);
    const e = el.endBinding && !ids.has(el.endBinding.elementId);
    if (s || e) {
      out ??= elements.slice();
      out[i] = { ...el, startBinding: s ? null : el.startBinding, endBinding: e ? null : el.endBinding };
    }
  });
  return out ?? elements;
}
