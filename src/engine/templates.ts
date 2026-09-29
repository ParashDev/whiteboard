// Starter boards. Built in code (not stored JSON) so labels are measured with
// the real fonts and arrows are bound exactly like hand-drawn ones — a
// template is indistinguishable from a board someone drew.

import { BACKGROUND_COLORS, DEFAULT_STYLES, HIGHLIGHTER_COLORS, STICKY_COLORS } from "./constants";
import { applyBindings } from "./binding";
import { fitShapeToLabel, getCenter, newDraw, newLinear, newShape, newText, normalizeDraw } from "./elements";
import type { BoardElement, LinearElement, ShapeElement, ShapeType, StyleProps, TextElement, Vec } from "./types";

export type TemplateId = "flowchart" | "mindmap" | "kanban" | "lesson" | "swot" | "retro" | "timeline" | "wireframe";

const STROKE = { green: "#2f9e44", red: "#e03131", blue: "#1971c2", orange: "#f08c00", grey: "#adb5bd" };

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

function swot(): BoardElement[] {
  const b = new Builder();
  b.text(0, 0, "SWOT analysis", { fontSize: 36 });
  const quadrants: [string, string, string, [string, string], number, number][] = [
    ["Strengths", STROKE.green, STICKY_COLORS[2], ["Loyal customers", "Fast shipping"], 0, 70],
    ["Weaknesses", STROKE.red, STICKY_COLORS[1], ["Small team", "Slow website"], 360, 70],
    ["Opportunities", STROKE.blue, STICKY_COLORS[3], ["A new city market", "Partnerships"], 0, 350],
    ["Threats", STROKE.orange, STICKY_COLORS[4], ["Rising costs", "A new competitor"], 360, 350],
  ];
  for (const [title, stroke, note, [a, c], x, y] of quadrants) {
    b.shape("rectangle", x, y, 340, 260, "", { strokeColor: stroke, strokeWidth: 2 });
    b.text(x + 20, y + 14, title, { fontSize: 28, strokeColor: stroke });
    b.sticky(x + 20, y + 80, a, note, -0.02, 140, 110);
    b.sticky(x + 180, y + 84, c, note, 0.025, 140, 110);
  }
  return b.elements;
}

function retro(): BoardElement[] {
  const b = new Builder();
  b.text(0, 0, "Sprint retrospective", { fontSize: 36 });
  const columns: [string, string, string, [string, number][]][] = [
    ["Went well", STROKE.green, STICKY_COLORS[2], [["Shipped the new checkout", 2], ["Great pairing sessions", 0]]],
    ["To improve", STROKE.red, STICKY_COLORS[1], [["Too many meetings", 3], ["Flaky tests", 1]]],
    ["Action items", STROKE.blue, STICKY_COLORS[3], [["Keep stand-ups to 10 minutes", 0], ["Fix the three flakiest tests", 0]]],
  ];
  columns.forEach(([title, stroke, note, cards], i) => {
    const x = i * 290;
    b.text(x + 4, 66, title, { fontFamily: "sans", fontSize: 24, strokeColor: stroke });
    b.shape("rectangle", x, 110, 260, 400, "", { strokeWidth: 1, roughness: 0, strokeColor: STROKE.grey });
    cards.forEach(([label, votes], j) => {
      const y = 136 + j * 170;
      b.sticky(x + 25, y, label, note, (j % 2 ? 1 : -1) * 0.015, 210, 124);
      // Dot votes along the note's bottom edge.
      for (let v = 0; v < votes; v++) {
        b.shape("ellipse", x + 190 - v * 20, y + 132, 14, 14, "", {
          backgroundColor: STROKE.red,
          strokeColor: STROKE.red,
          roughness: 0,
          strokeWidth: 1,
        });
      }
    });
  });
  return b.elements;
}

function timeline(): BoardElement[] {
  const b = new Builder();
  b.text(0, 0, "Launch roadmap", { fontSize: 36 });
  const lineY = 290;
  b.polyline(
    [
      [0, lineY],
      [1000, lineY],
    ],
    { strokeWidth: 2, endArrowhead: "arrow" },
  );
  const milestones: [string, string, string][] = [
    ["January", "Research and customer interviews", STICKY_COLORS[3]],
    ["March", "Design the prototype", STICKY_COLORS[5]],
    ["May", "Private beta with 50 users", STICKY_COLORS[0]],
    ["July", "Public launch", STICKY_COLORS[2]],
  ];
  milestones.forEach(([month, label, color], i) => {
    const cx = 110 + i * 250;
    const below = i % 2 === 0;
    const dot = b.shape("ellipse", cx - 12, lineY - 12, 24, 24, "", {
      backgroundColor: STROKE.blue,
      strokeColor: STROKE.blue,
      roughness: 0,
    });
    const note = b.sticky(cx - 90, below ? lineY + 70 : lineY - 70 - 116, label, color, (below ? -1 : 1) * 0.02, 180, 116);
    b.connect(dot, note, { line: true, style: { strokeColor: STROKE.grey, strokeWidth: 1 } });
    b.text(cx - 40, below ? lineY - 52 : lineY + 22, month, { fontFamily: "sans", fontSize: 20, strokeColor: "#495057" });
  });
  return b.elements;
}

function wireframe(): BoardElement[] {
  const b = new Builder();
  const muted = { strokeColor: STROKE.grey, strokeWidth: 2 };
  // Browser window.
  b.shape("rectangle", 0, 0, 640, 540, "", { strokeWidth: 2 });
  b.polyline(
    [
      [0, 40],
      [640, 40],
    ],
    { strokeWidth: 2 },
  );
  for (let i = 0; i < 3; i++) b.shape("ellipse", 16 + i * 20, 14, 11, 11, "", { strokeWidth: 1.5, roughness: 0 });
  // Navigation.
  b.shape("rectangle", 24, 60, 96, 34, "Logo", { fontSize: 16, edges: "sharp" });
  b.text(372, 66, "Features   Pricing   Contact", { fontFamily: "sans", fontSize: 16 });
  // Hero: headline, text lines, button, image placeholder.
  b.text(24, 128, "Big headline here", { fontSize: 32 });
  for (const [y, len] of [
    [194, 270],
    [216, 220],
  ]) {
    b.polyline(
      [
        [26, y],
        [26 + len, y],
      ],
      muted,
    );
  }
  const button = b.shape("rectangle", 24, 244, 140, 44, "Sign up", { backgroundColor: BLUE, fontSize: 18 });
  b.shape("rectangle", 340, 120, 272, 176, "", { strokeWidth: 1.5 });
  b.polyline(
    [
      [340, 120],
      [612, 296],
    ],
    muted,
  );
  b.polyline(
    [
      [612, 120],
      [340, 296],
    ],
    muted,
  );
  // Three feature cards.
  for (let i = 0; i < 3; i++) {
    const x = 24 + i * 204;
    b.shape("rectangle", x, 330, 184, 150, "", { strokeWidth: 1.5 });
    b.shape("ellipse", x + 16, 346, 36, 36, "", { strokeWidth: 1.5 });
    for (const [y, len] of [
      [404, 140],
      [428, 110],
    ]) {
      b.polyline(
        [
          [x + 16, y],
          [x + 16 + len, y],
        ],
        muted,
      );
    }
  }
  b.text(24, 500, "© 2026 Company", { fontFamily: "sans", fontSize: 14, strokeColor: "#868e96" });
  // A review comment pinned beside the page.
  const comment = b.sticky(700, 190, "Make the sign-up button stand out more", STICKY_COLORS[1], 0.03, 190, 130);
  b.connect(comment, button, { curved: true, via: [[520, 330]], style: { strokeColor: STROKE.red } });
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

export const TEMPLATES: { id: TemplateId; name: string; description: string; build: () => BoardElement[] }[] = [
  { id: "flowchart", name: "Flowchart", description: "Steps, a decision and a loop back", build: flowchart },
  { id: "mindmap", name: "Mind map", description: "One topic, six ideas on sticky notes", build: mindmap },
  { id: "kanban", name: "Kanban board", description: "To do, in progress and done", build: kanban },
  { id: "lesson", name: "Math lesson", description: "Handwriting, a diagram and homework", build: lesson },
  { id: "swot", name: "SWOT analysis", description: "Strengths, weaknesses, opportunities, threats", build: swot },
  { id: "retro", name: "Sprint retrospective", description: "Went well, to improve, action items", build: retro },
  { id: "timeline", name: "Project timeline", description: "A roadmap with four milestones", build: timeline },
  { id: "wireframe", name: "Website wireframe", description: "A landing page layout with a review note", build: wireframe },
];

/** The same launch plan, re-arranged tall and narrow so it stays readable on a phone. */
function heroCompact(): BoardElement[] {
  const b = new Builder();
  b.stroke(14, 34, 138, 32, "highlighter", HIGHLIGHTER_COLORS[0], 1);
  b.text(20, 10, "Launch plan", { fontSize: 36 });
  b.stroke(22, 66, 212, 62, "pen", "#1e1e1e", 2);
  const idea = b.shape("rectangle", 16, 108, 132, 68, "Idea", { backgroundColor: BLUE });
  const ready = b.shape("diamond", 206, 94, 176, 100, "Ready?", { backgroundColor: YELLOW });
  const ship = b.shape("ellipse", 214, 262, 160, 72, "Ship it", { backgroundColor: GREEN });
  b.connect(idea, ready);
  b.connect(ready, ship, { label: "yes" });
  b.sticky(10, 232, "Invite beta users", STICKY_COLORS[0], -0.045, 160, 112);
  b.sticky(104, 378, "Write the launch post", STICKY_COLORS[1], 0.035, 170, 108);
  return b.elements;
}

export function buildScene(id: TemplateId | "hero" | "hero-compact"): BoardElement[] {
  if (id === "hero") return hero();
  if (id === "hero-compact") return heroCompact();
  return TEMPLATES.find((t) => t.id === id)?.build() ?? [];
}

export function isTemplateId(v: string): v is TemplateId {
  return TEMPLATES.some((t) => t.id === v);
}
