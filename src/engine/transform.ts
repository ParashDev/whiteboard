// Resize, rotate and move. A single element resizes in its own rotated frame
// with the opposite handle pinned; a multi-selection scales uniformly around
// the pinned side of its bounding box, which is exact for rotated members too.

import { getCenter, isLinear, keepsAspect, normalizeLinear } from "./elements";
import { rotatePoint } from "./math";
import type { BoardElement, Bounds, Vec } from "./types";

export type HandleId = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "rotate";

export interface TransformBox {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

const HANDLE_DIR: Record<Exclude<HandleId, "rotate">, Vec> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

export function boxFromElement(el: BoardElement): TransformBox {
  return { x: el.x, y: el.y, width: el.width, height: el.height, angle: isLinear(el) ? 0 : el.angle };
}

export function boxFromBounds(b: Bounds): TransformBox {
  return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY, angle: 0 };
}

/** Handle positions in world space. `zoom` sizes the rotation handle's offset. */
export function getHandles(box: TransformBox, zoom: number, corners: boolean, edges: boolean, rotation: boolean): { id: HandleId; x: number; y: number }[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const out: { id: HandleId; x: number; y: number }[] = [];
  const pad = 4 / zoom;
  const place = (id: HandleId, lx: number, ly: number) => {
    const [x, y] = rotatePoint(lx, ly, cx, cy, box.angle);
    out.push({ id, x, y });
  };
  const hw = box.width / 2 + pad;
  const hh = box.height / 2 + pad;
  if (corners) {
    place("nw", cx - hw, cy - hh);
    place("ne", cx + hw, cy - hh);
    place("se", cx + hw, cy + hh);
    place("sw", cx - hw, cy + hh);
  }
  if (edges) {
    place("n", cx, cy - hh);
    place("s", cx, cy + hh);
    place("e", cx + hw, cy);
    place("w", cx - hw, cy);
  }
  if (rotation) place("rotate", cx, cy - hh - 22 / zoom);
  return out;
}

export function handleCursor(id: HandleId, angle: number): string {
  if (id === "rotate") return "grab";
  const base = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }[id];
  const deg = (((base + (angle * 180) / Math.PI) % 180) + 180) % 180;
  const snapped = Math.round(deg / 45) % 4;
  return ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"][snapped];
}

interface ResizeFlags {
  keepAspect: boolean;
  fromCenter: boolean;
}

/** Resize one element by dragging `handle` to world point (px, py). */
export function resizeElement(orig: BoardElement, handle: Exclude<HandleId, "rotate">, px: number, py: number, flags: ResizeFlags): BoardElement {
  const [hx, hy] = HANDLE_DIR[handle];
  const w0 = Math.max(orig.width, 1);
  const h0 = Math.max(orig.height, 1);
  const angle = isLinear(orig) ? 0 : orig.angle;
  const [c0x, c0y] = getCenter(orig);
  const [rx, ry] = rotatePoint(px, py, c0x, c0y, -angle);
  const qx = rx - c0x;
  const qy = ry - c0y;

  const anchorX = flags.fromCenter ? 0 : -hx * (w0 / 2);
  const anchorY = flags.fromCenter ? 0 : -hy * (h0 / 2);
  const factor = flags.fromCenter ? 2 : 1;
  let newW = hx ? (qx - anchorX) * hx * factor : w0;
  let newH = hy ? (qy - anchorY) * hy * factor : h0;

  const lockAspect = flags.keepAspect || (keepsAspect(orig) && hx !== 0 && hy !== 0);
  if (lockAspect) {
    if (hx && hy) {
      const s = Math.max(Math.abs(newW) / w0, Math.abs(newH) / h0);
      newW = Math.sign(newW || 1) * w0 * s;
      newH = Math.sign(newH || 1) * h0 * s;
    } else if (hx) newH = h0 * (Math.abs(newW) / w0);
    else if (hy) newW = w0 * (Math.abs(newH) / h0);
  }

  const minSize = 1;
  if (Math.abs(newW) < minSize) newW = Math.sign(newW || 1) * minSize;
  if (Math.abs(newH) < minSize) newH = Math.sign(newH || 1) * minSize;

  const lcx = flags.fromCenter ? 0 : hx ? anchorX + (hx * newW) / 2 : 0;
  const lcy = flags.fromCenter ? 0 : hy ? anchorY + (hy * newH) / 2 : 0;
  const [wcx, wcy] = rotatePoint(c0x + lcx, c0y + lcy, c0x, c0y, angle);
  const W = Math.abs(newW);
  const H = Math.abs(newH);
  const flipX = newW < 0;
  const flipY = newH < 0;
  const next = { x: wcx - W / 2, y: wcy - H / 2, width: W, height: H };

  switch (orig.type) {
    case "text":
      return { ...orig, ...next, fontSize: Math.max(4, orig.fontSize * (W / w0)) };
    case "draw": {
      const sx = orig.width > 0 ? W / orig.width : 1;
      const sy = orig.height > 0 ? H / orig.height : 1;
      return {
        ...orig,
        ...next,
        width: orig.width > 0 ? W : 0,
        height: orig.height > 0 ? H : 0,
        points: orig.points.map(([x, y, p]) => [
          (flipX ? orig.width - x : x) * sx,
          (flipY ? orig.height - y : y) * sy,
          p,
        ]),
      };
    }
    case "arrow":
    case "line": {
      const sx = orig.width > 0 ? W / orig.width : 1;
      const sy = orig.height > 0 ? H / orig.height : 1;
      return normalizeLinear({
        ...orig,
        ...next,
        points: orig.points.map(([x, y]) => [(flipX ? orig.width - x : x) * sx, (flipY ? orig.height - y : y) * sy] as Vec),
      });
    }
    default:
      return { ...orig, ...next };
  }
}

/** Uniformly scale a group by dragging a handle of its bounding box. */
export function resizeGroup(
  originals: readonly BoardElement[],
  box: TransformBox,
  handle: Exclude<HandleId, "rotate">,
  px: number,
  py: number,
  fromCenter: boolean,
): BoardElement[] {
  const [hx, hy] = HANDLE_DIR[handle];
  const w0 = Math.max(box.width, 1);
  const h0 = Math.max(box.height, 1);
  const cx = box.x + w0 / 2;
  const cy = box.y + h0 / 2;
  const ax = fromCenter || !hx ? cx : hx > 0 ? box.x : box.x + w0;
  const ay = fromCenter || !hy ? cy : hy > 0 ? box.y : box.y + h0;
  const f = fromCenter ? 2 : 1;
  const sx = hx ? ((px - ax) * hx * f) / w0 : 0;
  const sy = hy ? ((py - ay) * hy * f) / h0 : 0;
  let s = hx && hy ? Math.max(sx, sy) : hx ? sx : sy;
  s = Math.max(s, 4 / Math.max(w0, h0));

  return originals.map((el) => {
    if (isLinear(el)) {
      return normalizeLinear({
        ...el,
        x: ax + (el.x - ax) * s,
        y: ay + (el.y - ay) * s,
        points: el.points.map(([x, y]) => [x * s, y * s] as Vec),
      });
    }
    const [ecx, ecy] = getCenter(el);
    const ncx = ax + (ecx - ax) * s;
    const ncy = ay + (ecy - ay) * s;
    const w = el.width * s;
    const h = el.height * s;
    const moved = { x: ncx - w / 2, y: ncy - h / 2, width: w, height: h };
    if (el.type === "text") return { ...el, ...moved, fontSize: Math.max(4, el.fontSize * s) };
    if (el.type === "draw") return { ...el, ...moved, points: el.points.map(([x, y, p]) => [x * s, y * s, p] as [number, number, number]) };
    if (el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse" || el.type === "triangle" || el.type === "sticky") {
      return { ...el, ...moved, fontSize: el.label ? Math.max(4, el.fontSize * s) : el.fontSize };
    }
    return { ...el, ...moved };
  });
}

export function rotateElement(orig: BoardElement, px: number, py: number, snap: boolean): BoardElement {
  const [cx, cy] = getCenter(orig);
  let angle = Math.atan2(py - cy, px - cx) + Math.PI / 2;
  if (snap) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
  angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return { ...orig, angle };
}

/** Rotate every element around a shared centre by `delta` radians. */
export function rotateGroup(originals: readonly BoardElement[], cx: number, cy: number, delta: number): BoardElement[] {
  return originals.map((el) => {
    if (isLinear(el)) {
      const pts = el.points.map(([x, y]) => rotatePoint(el.x + x, el.y + y, cx, cy, delta));
      return normalizeLinear({ ...el, x: 0, y: 0, points: pts });
    }
    const [ecx, ecy] = getCenter(el);
    const [ncx, ncy] = rotatePoint(ecx, ecy, cx, cy, delta);
    const angle = (((el.angle + delta) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return { ...el, x: ncx - el.width / 2, y: ncy - el.height / 2, angle };
  });
}

export function translateElement<T extends BoardElement>(el: T, dx: number, dy: number): T {
  return { ...el, x: el.x + dx, y: el.y + dy };
}
