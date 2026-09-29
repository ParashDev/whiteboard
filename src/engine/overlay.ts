// The interactive layer drawn on top of the scene: selection frames and
// handles, the marquee, arrow-binding highlights, the stroke being drawn, and
// the laser pointer and eraser trails. Drawn in screen space so handles stay
// the same size at every zoom level.

import { LASER_COLOR, SELECTION_COLOR } from "./constants";
import { getCenter, isLinear, isRoundShape, isShape, linearWorldPoints, shapePolygon } from "./elements";
import { rotatePoint } from "./math";
import { paintOps, type SceneRenderOptions } from "./render";
import { getPaintOps } from "./shape";
import { getHandles, type TransformBox } from "./transform";
import type { BoardElement, Bounds, DrawElement, LinearElement, Vec, Viewport } from "./types";

export interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

export interface OverlayState {
  selected: readonly BoardElement[];
  /** Frame with handles: the element's own box, or the group's bounds. */
  frame: TransformBox | null;
  handles: { corners: boolean; edges: boolean; rotation: boolean };
  linearEdit: LinearElement | null;
  marquee: Bounds | null;
  bindTarget: BoardElement | null;
  /** Element under the pointer that a click would select. */
  hover: BoardElement | null;
  drawing: DrawElement | null;
  laserTrails: readonly TrailPoint[][];
  eraserTrail: readonly TrailPoint[];
  now: number;
}

export const LASER_LIFETIME = 1100;
export const ERASER_LIFETIME = 260;

function screen(v: Viewport, x: number, y: number): Vec {
  return [(x - v.x) * v.zoom, (y - v.y) * v.zoom];
}

function outlinePath(ctx: CanvasRenderingContext2D, el: BoardElement, v: Viewport, pad: number): void {
  const [cx, cy] = getCenter(el);
  ctx.beginPath();
  if (isRoundShape(el)) {
    const [sx, sy] = screen(v, cx, cy);
    ctx.ellipse(sx, sy, (el.width / 2) * v.zoom + pad, (el.height / 2) * v.zoom + pad, el.angle, 0, Math.PI * 2);
    return;
  }
  const poly = shapePolygon(el);
  poly.forEach(([px, py], i) => {
    const [wx, wy] = rotatePoint(el.x + px, el.y + py, cx, cy, el.angle);
    const [sx, sy] = screen(v, wx, wy);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
}

function boxPath(ctx: CanvasRenderingContext2D, box: TransformBox, v: Viewport, pad: number): void {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hw = box.width / 2 + pad / v.zoom;
  const hh = box.height / 2 + pad / v.zoom;
  const corners: Vec[] = [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ];
  ctx.beginPath();
  corners.forEach(([x, y], i) => {
    const [rx, ry] = rotatePoint(x, y, cx, cy, box.angle);
    const [sx, sy] = screen(v, rx, ry);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
}

/** A thin outline that follows the element: its polyline for arrows and lines, its box otherwise. */
function elementOutline(ctx: CanvasRenderingContext2D, el: BoardElement, v: Viewport, pad: number): void {
  if (isLinear(el)) {
    ctx.beginPath();
    linearWorldPoints(el).forEach(([x, y], i) => {
      const [sx, sy] = screen(v, x, y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    return;
  }
  if (isShape(el) && el.type !== "sticky") {
    outlinePath(ctx, el, v, pad);
    return;
  }
  boxPath(ctx, { x: el.x, y: el.y, width: el.width, height: el.height, angle: el.angle }, v, pad);
}

export function renderOverlay(ctx: CanvasRenderingContext2D, o: OverlayState, scene: SceneRenderOptions): void {
  const v = scene.viewport;
  const s = scene.pixelRatio;

  // Stroke in progress, in world space.
  if (o.drawing) {
    ctx.save();
    ctx.setTransform(s * v.zoom, 0, 0, s * v.zoom, -v.x * s * v.zoom, -v.y * s * v.zoom);
    ctx.translate(o.drawing.x, o.drawing.y);
    ctx.globalAlpha = o.drawing.opacity / 100;
    paintOps(ctx, getPaintOps(o.drawing));
    ctx.restore();
  }

  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.fillStyle = "#ffffff";

  if (o.bindTarget) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 6;
    outlinePath(ctx, o.bindTarget, v, 3);
    ctx.stroke();
    ctx.restore();
  }

  if (o.hover) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    elementOutline(ctx, o.hover, v, 3);
    ctx.stroke();
    ctx.restore();
  }

  if (o.selected.length > 1) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (const el of o.selected) {
      elementOutline(ctx, el, v, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (o.frame) {
    ctx.lineWidth = 1.5;
    boxPath(ctx, o.frame, v, 4);
    ctx.stroke();
    const handles = getHandles(o.frame, v.zoom, o.handles.corners, o.handles.edges, o.handles.rotation);
    const size = 9;
    for (const h of handles) {
      const [sx, sy] = screen(v, h.x, h.y);
      ctx.beginPath();
      if (h.id === "rotate") ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      else {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(o.frame.angle);
        ctx.roundRect(-size / 2, -size / 2, size, size, 2);
        ctx.restore();
      }
      ctx.fill();
      ctx.stroke();
    }
  }

  if (o.linearEdit) {
    const pts = linearWorldPoints(o.linearEdit);
    ctx.lineWidth = 1.5;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = screen(v, pts[i - 1][0], pts[i - 1][1]);
      const [bx, by] = screen(v, pts[i][0], pts[i][1]);
      if (Math.hypot(bx - ax, by - ay) < 36) continue;
      ctx.beginPath();
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.arc((ax + bx) / 2, (ay + by) / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (const [x, y] of pts) {
      const [sx, sy] = screen(v, x, y);
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (o.marquee) {
    const [x1, y1] = screen(v, o.marquee.minX, o.marquee.minY);
    const [x2, y2] = screen(v, o.marquee.maxX, o.marquee.maxY);
    ctx.save();
    ctx.fillStyle = "rgba(13, 148, 136, 0.07)";
    ctx.lineWidth = 1;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);
    ctx.restore();
  }

  drawTrail(ctx, o.eraserTrail, v, o.now, ERASER_LIFETIME, "#adb5bd", 10);
  for (const trail of o.laserTrails) drawTrail(ctx, trail, v, o.now, LASER_LIFETIME, LASER_COLOR, 5);
  ctx.restore();
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: readonly TrailPoint[],
  v: Viewport,
  now: number,
  life: number,
  color: string,
  width: number,
): void {
  if (trail.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (trail.length === 1) {
    const age = now - trail[0].t;
    ctx.globalAlpha = Math.max(0, 1 - age / life);
    const [sx, sy] = screen(v, trail[0].x, trail[0].y);
    ctx.beginPath();
    ctx.arc(sx, sy, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 1; i < trail.length; i++) {
    const age = now - trail[i].t;
    const alpha = Math.max(0, 1 - age / life);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * (0.4 + 0.6 * alpha);
    const [ax, ay] = screen(v, trail[i - 1].x, trail[i - 1].y);
    const [bx, by] = screen(v, trail[i].x, trail[i].y);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.restore();
}
