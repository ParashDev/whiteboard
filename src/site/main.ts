// Static pages: draws the product pictures. Each <canvas data-scene="…"> is a
// real board built by the same template code and painted by the same renderer
// as the app, so the pictures on the site are the product, not a mock-up.

import { getCommonBounds } from "../engine/elements";
import { ImageStore, renderScene } from "../engine/render";
import { buildScene, isTemplateId } from "../engine/templates";
import { loadBoardFonts } from "../engine/text";
import type { BoardElement } from "../engine/types";
import { registerServiceWorker } from "../shared/sw";

const scenes = new Map<HTMLCanvasElement, BoardElement[]>();
const images = new ImageStore();

function paint(canvas: HTMLCanvasElement): void {
  const elements = scenes.get(canvas);
  const ctx = canvas.getContext("2d");
  if (!elements || !ctx) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const b = getCommonBounds(elements);
  const pad = Number(canvas.dataset.pad ?? 28);
  const zoom = Math.min(w / (b.maxX - b.minX + pad * 2), h / (b.maxY - b.minY + pad * 2), 1.15);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  renderScene(ctx, elements, {
    viewport: { x: cx - w / 2 / zoom, y: cy - h / 2 / zoom, zoom },
    width: w,
    height: h,
    pixelRatio: dpr,
    background: "#ffffff",
    pattern: canvas.dataset.pattern === "plain" ? "plain" : "dots",
    images,
    files: {},
  });
}

async function start(): Promise<void> {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>("canvas[data-scene]")];
  if (!canvases.length) return;
  await loadBoardFonts();
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) paint(entry.target as HTMLCanvasElement);
  });
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const canvas = entry.target as HTMLCanvasElement;
        reveal.unobserve(canvas);
        const id = canvas.dataset.scene ?? "";
        scenes.set(canvas, buildScene(id === "hero" || !isTemplateId(id) ? "hero" : id));
        paint(canvas);
        resize.observe(canvas);
      }
    },
    { rootMargin: "300px 0px" },
  );
  canvases.forEach((c) => reveal.observe(c));
}

void start();
registerServiceWorker();
