// Static pages: draws the product pictures. Each <canvas data-scene="…"> is a
// real board built by the same template code and painted by the same renderer
// as the app, so the pictures on the site are the product, not a mock-up.

import { paintPreview } from "../engine/preview";
import { buildScene, isTemplateId, type TemplateId } from "../engine/templates";
import { loadBoardFonts } from "../engine/text";
import type { BoardElement } from "../engine/types";
import { registerServiceWorker } from "../shared/sw";

type SceneId = TemplateId | "hero" | "hero-compact";

const built = new Map<SceneId, BoardElement[]>();

function scene(id: SceneId): BoardElement[] {
  let els = built.get(id);
  if (!els) {
    els = buildScene(id);
    built.set(id, els);
  }
  return els;
}

/** Which board a canvas shows: the hero swaps to a tall layout on narrow screens so the writing stays legible. */
function sceneFor(canvas: HTMLCanvasElement): SceneId {
  const id = canvas.dataset.scene ?? "";
  if (id === "hero") return canvas.clientWidth < 520 ? "hero-compact" : "hero";
  return isTemplateId(id) ? id : "hero";
}

function paint(canvas: HTMLCanvasElement): void {
  paintPreview(canvas, scene(sceneFor(canvas)), {
    pad: Number(canvas.dataset.pad ?? 28),
    insetTop: Number(canvas.dataset.insetTop ?? 0),
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
