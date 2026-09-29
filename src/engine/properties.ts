// Which settings apply to which element — the single rule the style panel
// reads to decide its sections and the editor reads to decide what a change
// touches. A setting shows when at least one selected element uses it, and a
// change only lands on the elements that use it.

import { fitShapeToLabel, isShape, isShapeType, remeasureText } from "./elements";
import type { BoardElement, StyleGroup, StyleProps, Tool } from "./types";

export type PropKey =
  | "strokeColor"
  | "backgroundColor"
  | "fillStyle"
  | "strokeWidth"
  | "strokeStyle"
  | "roughness"
  | "edges"
  | "curved"
  | "arrowheads"
  | "fontFamily"
  | "fontSize"
  | "textAlign"
  | "opacity";

export type ColorPalette = "stroke" | "background" | "sticky" | "highlighter";

export function styleGroupOf(el: BoardElement): StyleGroup {
  switch (el.type) {
    case "sticky":
      return "sticky";
    case "arrow":
      return "arrow";
    case "line":
      return "line";
    case "draw":
      return el.variant === "highlighter" ? "highlighter" : "pen";
    case "text":
      return "text";
    case "image":
      return "image";
    default:
      return "shape";
  }
}

export function styleGroupOfTool(tool: Tool): StyleGroup | null {
  if (isShapeType(tool)) return "shape";
  switch (tool) {
    case "sticky":
      return "sticky";
    case "arrow":
      return "arrow";
    case "line":
      return "line";
    case "pen":
      return "pen";
    case "highlighter":
      return "highlighter";
    case "text":
      return "text";
    default:
      return null;
  }
}

const TEXT_PROPS: PropKey[] = ["fontFamily", "fontSize", "textAlign"];

/** Shapes with no corners to round. */
const NO_EDGES = new Set(["ellipse", "cloud", "cylinder", "terminator", "delay", "document", "actor"]);

/** Settings for an element type's tool before anything is drawn (no label yet). `shape` is the tool or element type. */
export function propsForGroup(group: StyleGroup, shape?: string): PropKey[] {
  switch (group) {
    case "shape":
      return [
        "strokeColor",
        "backgroundColor",
        "fillStyle",
        "strokeWidth",
        "strokeStyle",
        "roughness",
        ...(shape && NO_EDGES.has(shape) ? [] : (["edges"] as PropKey[])),
        "opacity",
      ];
    case "sticky":
      return ["backgroundColor", ...TEXT_PROPS, "opacity"];
    case "arrow":
    case "line":
      return ["strokeColor", "strokeWidth", "strokeStyle", "roughness", "curved", "arrowheads", "opacity"];
    case "pen":
    case "highlighter":
      return ["strokeColor", "strokeWidth", "opacity"];
    case "text":
      return ["strokeColor", ...TEXT_PROPS, "opacity"];
    case "image":
      return ["edges", "opacity"];
  }
}

/** Settings that apply to one specific element (a labelled shape also gets the font settings). */
export function propsForElement(el: BoardElement): PropKey[] {
  const group = styleGroupOf(el);
  const base = propsForGroup(group, el.type);
  const labelled = (isShape(el) && el.type !== "sticky" && el.label) || ((el.type === "arrow" || el.type === "line") && el.label);
  return labelled ? [...base.filter((k) => k !== "opacity"), ...TEXT_PROPS, "opacity"] : base;
}

export function paletteFor(key: "strokeColor" | "backgroundColor", groups: ReadonlySet<StyleGroup>): ColorPalette {
  if (key === "backgroundColor") return groups.size === 1 && groups.has("sticky") ? "sticky" : "background";
  return groups.size === 1 && groups.has("highlighter") ? "highlighter" : "stroke";
}

/** The StyleProps fields a panel setting writes. */
export function fieldsOf(key: PropKey): (keyof StyleProps)[] {
  return key === "arrowheads" ? ["startArrowhead", "endArrowhead"] : [key];
}

/** Apply a style patch to one element, re-fitting text where a font change needs it. */
export function applyStyle(el: BoardElement, patch: Partial<StyleProps>): BoardElement {
  const allowed = new Set(propsForElement(el).flatMap(fieldsOf));
  const relevant: Partial<StyleProps> = {};
  let changed = false;
  for (const [k, v] of Object.entries(patch) as [keyof StyleProps, StyleProps[keyof StyleProps]][]) {
    if (!allowed.has(k) || el[k] === v) continue;
    (relevant as Record<string, unknown>)[k] = v;
    changed = true;
  }
  if (!changed) return el;
  const next = { ...el, ...relevant } as BoardElement;
  if (next.type === "text") return remeasureText(next);
  if (isShape(next) && next.label && ("fontFamily" in relevant || "fontSize" in relevant)) return fitShapeToLabel(next);
  return next;
}
