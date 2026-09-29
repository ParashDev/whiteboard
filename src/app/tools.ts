import type { ComponentType } from "react";
import {
  Circle,
  Cloud,
  Cylinder,
  Diamond,
  Eraser,
  Hand,
  Hexagon,
  Highlighter,
  ImagePlus,
  MessageSquare,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Slash,
  Square,
  Star,
  StickyNote,
  Triangle,
  Type,
  WandSparkles,
} from "lucide-react";
import { BASIC_SHAPES, DIAGRAM_SHAPES, SHAPE_TYPES } from "../engine/elements";
import type { Tool } from "../engine/types";
import {
  ActorIcon,
  DelayIcon,
  DocumentShapeIcon,
  ManualInputIcon,
  OffPageIcon,
  ParallelogramIcon,
  SubroutineIcon,
  TerminatorIcon,
  TrapezoidIcon,
} from "./components/icons";

export interface ToolInfo {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  key?: string;
}

export const TOOLS: Record<Tool, ToolInfo> = {
  hand: { label: "Hand — move the canvas", icon: Hand, key: "H" },
  select: { label: "Select", icon: MousePointer2, key: "V" },
  rectangle: { label: "Rectangle", icon: Square, key: "R" },
  diamond: { label: "Diamond", icon: Diamond, key: "D" },
  ellipse: { label: "Ellipse", icon: Circle, key: "O" },
  triangle: { label: "Triangle", icon: Triangle },
  hexagon: { label: "Hexagon", icon: Hexagon },
  star: { label: "Star", icon: Star },
  cloud: { label: "Cloud", icon: Cloud },
  bubble: { label: "Speech bubble", icon: MessageSquare },
  terminator: { label: "Start / end", icon: TerminatorIcon },
  parallelogram: { label: "Data (input/output)", icon: ParallelogramIcon },
  document: { label: "Document", icon: DocumentShapeIcon },
  subroutine: { label: "Predefined process", icon: SubroutineIcon },
  manualinput: { label: "Manual input", icon: ManualInputIcon },
  trapezoid: { label: "Manual operation", icon: TrapezoidIcon },
  delay: { label: "Delay", icon: DelayIcon },
  offpage: { label: "Off-page link", icon: OffPageIcon },
  cylinder: { label: "Database", icon: Cylinder },
  actor: { label: "Actor (person)", icon: ActorIcon },
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

export interface ToolGroup {
  label: string;
  tools: Tool[];
}

export type Slot =
  | { kind: "tool"; tool: Tool }
  | { kind: "family"; family: Family; label: string; tools: Tool[]; groups?: ToolGroup[] };

/** Toolbar order. Families share one button that remembers the last tool picked from it. */
export const SLOTS: Slot[] = [
  { kind: "tool", tool: "hand" },
  { kind: "tool", tool: "select" },
  {
    kind: "family",
    family: "shape",
    label: "Shapes",
    tools: [...SHAPE_TYPES],
    groups: [
      { label: "Basic", tools: [...BASIC_SHAPES] },
      { label: "Flowchart & diagrams", tools: [...DIAGRAM_SHAPES] },
    ],
  },
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
