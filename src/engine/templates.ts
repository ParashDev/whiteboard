// Starter boards. Built in code (not stored JSON) so labels are measured with
// the real fonts and arrows are bound exactly like hand-drawn ones — a
// template is indistinguishable from a board someone drew.

import { BACKGROUND_COLORS, DEFAULT_STYLES, HIGHLIGHTER_COLORS, STICKY_COLORS } from "./constants";
import { applyBindings } from "./binding";
import { fitShapeToLabel, getCenter, newDraw, newLinear, newShape, newText, normalizeDraw } from "./elements";
import type { BoardElement, LinearElement, ShapeElement, ShapeType, StyleProps, TextElement, Vec } from "./types";

export type TemplateId = "flowchart" | "mindmap" | "kanban" | "lesson";

class Builder {
  readonly elements: BoardElement[] = [];

  private add<T extends BoardElement>(el: T): T {
    this.elements.push(el);
    return el;
  }

  shape(type: ShapeType, x: number, y: number, w: number, h: number, label: string, style: Partial<StyleProps> = {}): ShapeElement {
    return this.add(fitShapeToLabel(newShape(type, x, y, w, h, { ...DEFAULT_STYLES.shape, ...style }, label)));
  }

  sticky(x: number, y: number, label: string, color: string, angle = 0, w = 180, h = 130): ShapeElement {
    const el = fitShapeToLabel(newShape("sticky", x, y, w, h, { ...DEFAULT_STYLES.sticky, backgroundColor: color }, label));
    return this.add({ ...el, angle });
  }

  text(x: number, y: number, text: string, style: Partial<StyleProps> = {}): TextElement {
    return this.add(newText(x, y, text, { ...DEFAULT_STYLES.text, ...style }));
  }

  connect(
    from: BoardElement,
    to: BoardElement,
    opts: { label?: string; via?: Vec[]; line?: boolean; curved?: boolean; style?: Partial<StyleProps> } = {},
  ): LinearElement {
    const pts: Vec[] = [getCenter(from), ...(opts.via ?? []), getCenter(to)];
    const type = opts.line ? "line" : "arrow";
    const style = { ...DEFAULT_STYLES[type], curved: !!opts.curved, ...opts.style };
    const raw = newLinear(type, 0, 0, pts, style);
    const bound = applyBindings(
      { ...raw, label: opts.label ?? "", startBinding: { elementId: from.id }, endBinding: { elementId: to.id } },
      new Map(this.elements.map((e) => [e.id, e])),
    );
    return this.add(bound);
  }

  polyline(points: Vec[], style: Partial<StyleProps> = {}): LinearElement {
    return this.add(newLinear("line", 0, 0, points, { ...DEFAULT_STYLES.line, ...style }));
  }

  /** A hand-drawn stroke along a gentle wave from (x0, y0) to (x1, y1). */
  stroke(x0: number, y0: number, x1: number, y1: number, variant: "pen" | "highlighter", color: string, amp = 2.5): void {
    const steps = Math.max(8, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI * 3) * amp, 0.5]);
    }
    const style = variant === "pen" ? { ...DEFAULT_STYLES.pen, strokeColor: color } : { ...DEFAULT_STYLES.highlighter, strokeColor: color };
    this.add(normalizeDraw(newDraw(0, 0, pts, variant, true, style)));
  }
}

const [, PINK, GREEN, BLUE, YELLOW] = BACKGROUND_COLORS;

function flowchart(): BoardElement[] {
  const b = new Builder();
  const start = b.shape("ellipse", 60, 0, 180, 70, "Start", { backgroundColor: GREEN });
  const draft = b.shape("rectangle", 50, 130, 200, 80, "Write the draft", { backgroundColor: BLUE });
  const check = b.shape("diamond", 30, 270, 240, 150, "Approved?", { backgroundColor: YELLOW });
  const publish = b.shape("rectangle", 50, 490, 200, 80, "Publish", { backgroundColor: BLUE });
  const done = b.shape("ellipse", 60, 630, 180, 70, "Done", { backgroundColor: PINK });
  const revise = b.shape("rectangle", 380, 305, 190, 80, "Revise", { backgroundColor: BLUE });
  b.connect(start, draft);
  b.connect(draft, check);
  b.connect(check, publish, { label: "yes" });
  b.connect(publish, done);
  b.connect(check, revise, { label: "no" });
  b.connect(revise, draft, { via: [[475, 170]] });
  return b.elements;
}

function mindmap(): BoardElement[] {
  const b = new Builder();
  const hub = b.shape("ellipse", 300, 230, 240, 110, "New product", { backgroundColor: BLUE, fontSize: 28 });
  const notes: [number, number, string, string, number][] = [
    [40, 20, "Who is it for?", STICKY_COLORS[0], -0.05],
    [330, -30, "Must-have features", STICKY_COLORS[3], 0.02],
    [620, 20, "Pricing ideas", STICKY_COLORS[2], 0.05],
    [640, 360, "Launch date", STICKY_COLORS[1], -0.03],
    [330, 440, "Risks", STICKY_COLORS[4], 0.03],
    [20, 360, "Where we'll market it", STICKY_COLORS[5], 0.04],
  ];
  for (const [x, y, label, color, angle] of notes) {
    const note = b.sticky(x, y, label, color, angle, 180, 120);
    b.connect(hub, note, { line: true });
  }
  return b.elements;
}

function kanban(): BoardElement[] {
  const b = new Builder();
  const columns: [string, [string, string][]][] = [
    ["To do", [["Sketch the homepage", STICKY_COLORS[0]], ["Write the FAQ", STICKY_COLORS[1]]]],
    ["In progress", [["Pick brand colours", STICKY_COLORS[3]]]],
    ["Done", [["Buy the domain", STICKY_COLORS[2]], ["Set up hosting", STICKY_COLORS[2]]]],
  ];
  columns.forEach(([title, cards], i) => {
    const x = i * 290;
    b.text(x + 4, 0, title, { fontFamily: "sans", fontSize: 28 });
    b.shape("rectangle", x, 52, 260, 470, "", { strokeWidth: 1, roughness: 0, strokeColor: "#adb5bd" });
    cards.forEach(([label, color], j) => {
      b.sticky(x + 25, 80 + j * 150, label, color, (j % 2 ? 1 : -1) * 0.015, 210, 120);
    });
  });
  return b.elements;
}

function lesson(): BoardElement[] {
  const b = new Builder();
  b.stroke(-4, 42, 360, 40, "highlighter", HIGHLIGHTER_COLORS[0], 1.5);
  b.text(0, 0, "Pythagorean theorem", { fontSize: 36 });
  // Right triangle with sides a = 3, b = 4, c = 5 (scaled).
  b.polyline(
    [
      [40, 110],
      [40, 350],
      [360, 350],
      [40, 110],
    ],
    { strokeWidth: 2 },
  );
  b.shape("rectangle", 40, 326, 24, 24, "", { roughness: 0, strokeWidth: 1, edges: "sharp" });
  b.text(10, 215, "a", { fontSize: 28 });
  b.text(192, 356, "b", { fontSize: 28 });
  b.text(212, 196, "c", { fontSize: 28 });
  b.text(440, 150, "a² + b² = c²", { fontSize: 36, strokeColor: "#1971c2" });
  b.stroke(436, 202, 668, 198, "pen", "#1971c2", 2);
  b.text(440, 240, "3² + 4² = 9 + 16 = 25\n√25 = 5, so c = 5", { fontSize: 20 });
  const note = b.sticky(470, 360, "Homework: page 42, questions 1–5", STICKY_COLORS[0], 0.03, 200, 120);
  const formula = b.elements.find((el) => el.type === "text" && el.text.startsWith("a²"));
  if (formula) b.connect(note, formula, { curved: true, via: [[700, 330]], style: { strokeColor: "#e03131" } });
  return b.elements;
}

/** The composition shown in the landing page's hero picture. */
function hero(): BoardElement[] {
  const b = new Builder();
  b.stroke(34, 44, 158, 42, "highlighter", HIGHLIGHTER_COLORS[0], 1);
  b.text(40, 20, "Launch plan", { fontSize: 36 });
  b.stroke(42, 76, 232, 72, "pen", "#1e1e1e", 2);
  const idea = b.shape("rectangle", 40, 130, 150, 72, "Idea", { backgroundColor: BLUE });
  const ready = b.shape("diamond", 250, 112, 180, 110, "Ready?", { backgroundColor: YELLOW });
  const ship = b.shape("ellipse", 500, 130, 160, 72, "Ship it", { backgroundColor: GREEN });
  b.connect(idea, ready);
  b.connect(ready, ship, { label: "yes" });
  const fix = b.sticky(470, 290, "Fix the onboarding", STICKY_COLORS[3], -0.03, 170, 120);
  b.connect(ready, fix, { label: "no", curved: true, via: [[380, 300]] });
  b.sticky(40, 285, "Invite beta users", STICKY_COLORS[0], -0.045, 170, 120);
  b.sticky(250, 305, "Write the launch post", STICKY_COLORS[1], 0.035, 170, 120);
  return b.elements;
}

export const TEMPLATES: { id: TemplateId; name: string; build: () => BoardElement[] }[] = [
  { id: "flowchart", name: "Flowchart", build: flowchart },
  { id: "mindmap", name: "Mind map", build: mindmap },
  { id: "kanban", name: "Kanban board", build: kanban },
  { id: "lesson", name: "Math lesson", build: lesson },
];

export function buildScene(id: TemplateId | "hero"): BoardElement[] {
  if (id === "hero") return hero();
  return TEMPLATES.find((t) => t.id === id)?.build() ?? [];
}

export function isTemplateId(v: string): v is TemplateId {
  return TEMPLATES.some((t) => t.id === v);
}
