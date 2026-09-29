import {
  Circle,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Slash,
  Square,
  StickyNote,
  Triangle,
  Type,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { Tool } from "../engine/types";

export interface ToolInfo {
  label: string;
  icon: LucideIcon;
  key?: string;
}

export const TOOLS: Record<Tool, ToolInfo> = {
  hand: { label: "Hand — move the canvas", icon: Hand, key: "H" },
  select: { label: "Select", icon: MousePointer2, key: "V" },
  rectangle: { label: "Rectangle", icon: Square, key: "R" },
  diamond: { label: "Diamond", icon: Diamond, key: "D" },
  ellipse: { label: "Ellipse", icon: Circle, key: "O" },
  triangle: { label: "Triangle", icon: Triangle },
  sticky: { label: "Sticky note", icon: StickyNote, key: "N" },
  arrow: { label: "Arrow", icon: MoveUpRight, key: "A" },
  line: { label: "Line", icon: Slash, key: "L" },
  pen: { label: "Pen", icon: Pencil, key: "P" },
  highlighter: { label: "Highlighter", icon: Highlighter, key: "M" },
  laser: { label: "Laser pointer", icon: WandSparkles, key: "K" },
  text: { label: "Text", icon: Type, key: "T" },
  eraser: { label: "Eraser", icon: Eraser, key: "E" },
  image: { label: "Insert image", icon: ImagePlus, key: "9" },
};

export type Family = "shape" | "linear" | "draw";

export type Slot = { kind: "tool"; tool: Tool } | { kind: "family"; family: Family; label: string; tools: Tool[] };

/** Toolbar order. Families share one button that remembers the last tool picked from it. */
export const SLOTS: Slot[] = [
  { kind: "tool", tool: "hand" },
  { kind: "tool", tool: "select" },
  { kind: "family", family: "shape", label: "Shapes", tools: ["rectangle", "diamond", "ellipse", "triangle"] },
  { kind: "tool", tool: "sticky" },
  { kind: "family", family: "linear", label: "Arrows and lines", tools: ["arrow", "line"] },
  { kind: "family", family: "draw", label: "Pen, highlighter and laser", tools: ["pen", "highlighter", "laser"] },
  { kind: "tool", tool: "text" },
  { kind: "tool", tool: "eraser" },
  { kind: "tool", tool: "image" },
];

export function toolTitle(tool: Tool): string {
  const t = TOOLS[tool];
  return t.key ? `${t.label} — ${t.key}` : t.label;
}
