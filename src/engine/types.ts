// The board's data model. Everything on the canvas is one of these element
// records; they are treated as immutable (every change makes a new object), so
// undo history is just a list of array snapshots and the renderer can cache
// geometry by object identity.

export type Vec = [number, number];

export type ShapeType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "star"
  | "cylinder"
  | "cloud"
  | "bubble"
  | "terminator"
  | "document"
  | "subroutine"
  | "manualinput"
  | "trapezoid"
  | "delay"
  | "offpage"
  | "actor";
export type LinearType = "arrow" | "line";
export type ElementType = ShapeType | "sticky" | LinearType | "draw" | "text" | "image";

export type FillStyle = "solid" | "hachure" | "cross-hatch";
export type StrokeStyle = "solid" | "dashed" | "dotted";
/** 0 = architect (clean), 1 = artist, 2 = cartoonist */
export type Roughness = 0 | 1 | 2;
export type Edges = "sharp" | "round";
export type FontFamily = "hand" | "sans" | "mono";
export type TextAlign = "left" | "center" | "right";
export type Arrowhead = "none" | "arrow" | "triangle" | "dot" | "bar";
export type DrawVariant = "pen" | "highlighter";

export interface Binding {
  elementId: string;
}

/** The properties the style panel edits. Every element carries all of them;
 *  each element type simply ignores the ones it has no use for. */
export interface StyleProps {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: Roughness;
  edges: Edges;
  opacity: number;
  fontFamily: FontFamily;
  fontSize: number;
  textAlign: TextAlign;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  curved: boolean;
}

interface BaseElement extends StyleProps {
  id: string;
  /** Top-left of the unrotated box, in world units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians, clockwise, around the box centre. Always 0 for arrows and lines. */
  angle: number;
  seed: number;
  /** Innermost group first, outermost last. */
  groupIds: string[];
}

export interface ShapeElement extends BaseElement {
  type: ShapeType | "sticky";
  label: string;
}

export interface LinearElement extends BaseElement {
  type: LinearType;
  /** Relative to x/y; normalised so the smallest x and y are 0. */
  points: Vec[];
  label: string;
  startBinding: Binding | null;
  endBinding: Binding | null;
}

export interface DrawElement extends BaseElement {
  type: "draw";
  /** [x, y, pressure] relative to x/y. */
  points: [number, number, number][];
  variant: DrawVariant;
  simulatePressure: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
}

export interface ImageElement extends BaseElement {
  type: "image";
  fileId: string;
}

export type BoardElement = ShapeElement | LinearElement | DrawElement | TextElement | ImageElement;

export interface BoardFile {
  id: string;
  mimeType: string;
  dataURL: string;
}

export type FileMap = Record<string, BoardFile>;

export type CanvasPattern = "plain" | "dots" | "grid";

export interface Viewport {
  /** World coordinate shown at the screen's top-left corner. */
  x: number;
  y: number;
  zoom: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type Tool =
  | "hand"
  | "select"
  | ShapeType
  | "sticky"
  | LinearType
  | "pen"
  | "highlighter"
  | "laser"
  | "text"
  | "eraser"
  | "image";

/** Tools that remember their own style between uses. */
export type StyleGroup = "shape" | "sticky" | "arrow" | "line" | "pen" | "highlighter" | "text" | "image";
