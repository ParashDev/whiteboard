// Static pages: draws the product pictures. Each <canvas data-scene="…"> is a
// real board built by the same template code and painted by the same renderer
// as the app, so the pictures on the site are the product, not a mock-up.

import { paintPreview } from "../engine/preview";
import { buildScene, isTemplateId } from "../engine/templates";
import { loadBoardFonts } from "../engine/text";
import type { BoardElement } from "../engine/types";
import { registerServiceWorker } from "../shared/sw";

const scenes = new Map<HTMLCanvasElement, BoardElement[]>();

function paint(canvas: HTMLCanvasElement): void {
  const elements = scenes.get(canvas);
  if (!elements) return;
  paintPreview(canvas, elements, {
    pad: Number(canvas.dataset.pad ?? 28),
    pattern: canvas.dataset.pattern === "plain" ? "plain" : "dots",
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
