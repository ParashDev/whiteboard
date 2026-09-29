import type { FontFamily, StyleGroup, StyleProps } from "./types";

export const INK = "#1e1e1e";

export const STROKE_COLORS = [INK, "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
export const BACKGROUND_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];
export const STICKY_COLORS = ["#fff3a3", "#ffd6e0", "#c9f2d0", "#cfe8ff", "#ffe0b8", "#e5dbff"];
export const HIGHLIGHTER_COLORS = ["#ffe066", "#8ce99a", "#ffa8a8", "#74c0fc", "#ffc078"];
export const CANVAS_BACKGROUNDS = ["#ffffff", "#f8f9fa", "#f5faff", "#fffce8", "#fdf8f6"];

export const FONT_SIZES = [
  { label: "S", value: 16 },
  { label: "M", value: 20 },
  { label: "L", value: 28 },
  { label: "XL", value: 36 },
] as const;

export const FONT_STACKS: Record<FontFamily, string> = {
  hand: '"Kalam", "Segoe Print", "Comic Sans MS", cursive',
  sans: '"Geist Variable", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, "SF Mono", Consolas, monospace',
};

export const LINE_HEIGHT = 1.25;
/** Inner padding between a shape's outline and its label. */
export const LABEL_PADDING = 10;
/** Gap left between a bound arrow's tip and the shape outline. */
export const BINDING_GAP = 6;
export const GRID_SIZE = 20;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;
export const SELECTION_COLOR = "#0d9488";
export const LASER_COLOR = "#ef4444";

const base: StyleProps = {
  strokeColor: INK,
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  edges: "round",
  opacity: 100,
  fontFamily: "hand",
  fontSize: 20,
  textAlign: "center",
  startArrowhead: "none",
  endArrowhead: "arrow",
  curved: false,
};

export const DEFAULT_STYLES: Record<StyleGroup, StyleProps> = {
  shape: { ...base },
  sticky: { ...base, backgroundColor: STICKY_COLORS[0], roughness: 0, edges: "sharp", fontSize: 20 },
  arrow: { ...base, fontSize: 16 },
  line: { ...base, endArrowhead: "none", fontSize: 16 },
  pen: { ...base, strokeWidth: 2 },
  highlighter: { ...base, strokeColor: HIGHLIGHTER_COLORS[0], strokeWidth: 2, opacity: 45 },
  text: { ...base, textAlign: "left" },
  image: { ...base, edges: "sharp" },
};

/** Perfect-freehand diameter for a draw element's stroke width setting. */
export function freedrawSize(variant: "pen" | "highlighter", strokeWidth: number): number {
  return variant === "highlighter" ? strokeWidth * 8 + 4 : strokeWidth * 2.2 + 1.2;
}
