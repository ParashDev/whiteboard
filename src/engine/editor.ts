// The whiteboard editor: owns the document, the viewport and every pointer,
// touch and keyboard interaction, and renders to a single canvas. It is plain
// TypeScript with no framework; the React UI subscribes to `state` and calls
// the public methods. The document (elements + files) is kept outside `state`
// because it changes on every pointer move; `state.sceneVersion` tells the UI
// when to re-read it.

import { applyBindings, getBindableAt, outlinePointToward, pruneBindings, updateBoundArrows } from "./binding";
import {
  DEFAULT_STYLES,
  FONT_STACKS,
  GRID_SIZE,
  LINE_HEIGHT,
  MAX_ZOOM,
  MIN_ZOOM,
  CANVAS_BACKGROUNDS,
} from "./constants";
import {
  fitShapeToLabel,
  getCommonBounds,
  getElementBounds,
  isLinear,
  isShape,
  isShapeType,
  layoutLinearLabel,
  layoutShapeLabel,
  linearWorldPoints,
  newDraw,
  newImage,
  newLinear,
  newShape,
  newText,
  normalizeDraw,
  normalizeLinear,
  randomId,
  remeasureText,
} from "./elements";
import { downloadBlob } from "./export";
import { History } from "./history";
import { getElementAtPoint, pointInElementBox } from "./hittest";
import { boundsContain, clamp, isFiniteBounds, snapAngle } from "./math";
import { ERASER_LIFETIME, LASER_LIFETIME, renderOverlay, type OverlayState, type TrailPoint } from "./overlay";
import { applyStyle, fieldsOf, propsForElement, styleGroupOf, styleGroupOfTool } from "./properties";
import { ImageStore, renderScene, type SceneRenderOptions } from "./render";
import {
  FILE_EXTENSION,
  SHARE_LIMIT,
  SHARE_PREFIX,
  decodeShare,
  encodeShare,
  parseBoard,
  parseClipboard,
  restoreCanvas,
  restoreStyleProps,
  serializeBoard,
  serializeClipboard,
  shareLinksSupported,
  usedFiles,
  type BoardData,
  type CanvasSettings,
} from "./serialize";
import { loadBoard, loadPrefs, loadViewport, saveBoard, savePrefs, saveViewport } from "./storage";
import { buildScene, isTemplateId, type TemplateId } from "./templates";
import { loadBoardFonts } from "./text";
import {
  boxFromBounds,
  boxFromElement,
  getHandles,
  handleCursor,
  resizeElement,
  resizeGroup,
  rotateElement,
  rotateGroup,
  translateElement,
  type HandleId,
  type TransformBox,
} from "./transform";
import type {
  BoardElement,
  Bounds,
  DrawElement,
  FileMap,
  LinearElement,
  ShapeType,
  StyleGroup,
  StyleProps,
  Tool,
  Vec,
  Viewport,
} from "./types";

export type ShapeTool = ShapeType | "sticky";
export type LinearTool = "arrow" | "line";
export type DrawTool = "pen" | "highlighter" | "laser";
export type DialogName = "export" | "shortcuts" | "templates" | "share" | "reset" | null;
export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type LayerMove = "front" | "forward" | "backward" | "back";

export interface EditingState {
  id: string;
  kind: "text" | "label";
}

export interface EditorState {
  ready: boolean;
  tool: Tool;
  toolLocked: boolean;
  lastShape: ShapeType;
  lastLinear: LinearTool;
  lastDraw: DrawTool;
  viewport: Viewport;
  selectedIds: string[];
  editing: EditingState | null;
  styles: Record<StyleGroup, StyleProps>;
  theme: "light" | "dark";
  canvas: CanvasSettings;
  snap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  sceneVersion: number;
  isEmpty: boolean;
  dialog: DialogName;
  pendingShared: BoardData | null;
  toast: { id: number; message: string } | null;
  multiPoint: boolean;
}

export interface EditLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  originX: number;
  originY: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  wrap: boolean;
  value: string;
}

type Interaction =
  | { kind: "none" }
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "pinch"; startDist: number; startZoom: number; anchor: Vec }
  | { kind: "marquee"; start: Vec; current: Vec; base: string[] }
  | {
      kind: "move";
      start: Vec;
      originals: Map<string, BoardElement>;
      moved: boolean;
      duplicate: boolean;
      clickSelect: string[] | null;
      clickDeselect: string[] | null;
    }
  | { kind: "resize"; handle: Exclude<HandleId, "rotate">; originals: BoardElement[]; box: TransformBox }
  | { kind: "rotate"; originals: BoardElement[]; center: Vec; startAngle: number }
  | { kind: "point"; id: string; index: number; original: LinearElement; moved: boolean }
  | { kind: "create-shape"; id: string; start: Vec; tool: ShapeTool }
  | { kind: "create-linear"; id: string; start: Vec; startBinding: string | null }
  | { kind: "linear-multi"; id: string; lastScreen: Vec }
  | { kind: "draw" }
  | { kind: "laser" }
  | { kind: "erase"; hits: Set<string>; last: Vec };

/** Size a shape gets when placed with a click instead of a drag. */
const DEFAULT_SIZES: Partial<Record<ShapeTool, [number, number]>> = {
  sticky: [200, 200],
  ellipse: [150, 110],
  diamond: [160, 120],
  triangle: [150, 130],
  parallelogram: [180, 100],
  hexagon: [160, 130],
  star: [150, 145],
  cylinder: [120, 150],
  cloud: [200, 124],
  bubble: [180, 130],
  terminator: [180, 70],
  document: [170, 110],
  subroutine: [190, 90],
  manualinput: [180, 100],
  trapezoid: [180, 100],
  delay: [170, 90],
  offpage: [110, 110],
  actor: [70, 120],
};

const HANDLE_HIT_MOUSE = 9;
const HANDLE_HIT_TOUCH = 18;
const CLICK_SLOP = 4;

const isEditableTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class Editor {
  elements: BoardElement[] = [];
  files: FileMap = {};

  private state: EditorState;
  private listeners = new Set<() => void>();
  private history = new History({ elements: [], files: {} });
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private images = new ImageStore(() => this.requestRender());
  private interaction: Interaction = { kind: "none" };
  private pointers = new Map<number, Vec>();
  private pointerType = "mouse";
  private gestureStart: BoardElement[] | null = null;
  private spaceDown = false;
  private lastWorld: Vec | null = null;
  private drawing: DrawElement | null = null;
  private bindTarget: BoardElement | null = null;
  private laserTrails: TrailPoint[][] = [];
  private activeLaser: TrailPoint[] | null = null;
  private eraserTrail: TrailPoint[] = [];
  private raf = 0;
  private notifyFrame = 0;
  private silentChange = false;
  private hoverId: string | null = null;
  private announcedElements: BoardElement[] = this.elements;
  private savedElements: BoardElement[] | null = null;
  private savedFiles: FileMap | null = null;
  private saveTimer = 0;
  private toastTimer = 0;
  private internalClipboard: string | null = null;

  constructor() {
    this.state = {
      ready: false,
      tool: "select",
      toolLocked: false,
      lastShape: "rectangle",
      lastLinear: "arrow",
      lastDraw: "pen",
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedIds: [],
      editing: null,
      styles: structuredClone(DEFAULT_STYLES),
      theme: "light",
      canvas: { background: CANVAS_BACKGROUNDS[0], pattern: "dots" },
      snap: false,
      canUndo: false,
      canRedo: false,
      sceneVersion: 0,
      isEmpty: true,
      dialog: null,
      pendingShared: null,
      toast: null,
      multiPoint: false,
    };
  }

  // ─── Store plumbing ──────────────────────────────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): EditorState => this.state;

  private emit(): void {
    if (this.notifyFrame) {
      cancelAnimationFrame(this.notifyFrame);
      this.notifyFrame = 0;
    }
    this.silentChange = false;
    for (const fn of this.listeners) fn();
  }

  /**
   * `frame` coalesces rapid changes (pan, zoom) into at most one UI update per frame.
   * `silent` changes state without telling the UI at all; the gesture's end does
   * that once (box-selecting would otherwise re-render the style panel every frame).
   */
  private setState(patch: Partial<EditorState>, mode: "now" | "frame" | "silent" = "now"): void {
    this.state = { ...this.state, ...patch };
    if (mode === "now") this.emit();
    else if (mode === "silent") this.silentChange = true;
    else if (!this.notifyFrame) {
      this.notifyFrame = requestAnimationFrame(() => {
        this.notifyFrame = 0;
        this.emit();
      });
    }
  }

  /**
   * Replace the document. During a pointer gesture only the canvas redraws; the
   * React UI hears about the change once, when the gesture ends. Re-rendering the
   * panels on every pointer move is what made dragging lag.
   */
  private setElements(next: BoardElement[], commit = false): void {
    if (next !== this.elements) {
      this.elements = next;
      this.requestRender();
    }
    if (this.interaction.kind === "none") this.announceScene();
    if (commit) this.commit();
  }

  /** Tell the UI the scene (and any silent state change) moved on. No-op when it is current. */
  private announceScene(): void {
    if (this.announcedElements !== this.elements) {
      this.announcedElements = this.elements;
      this.setState({ sceneVersion: this.state.sceneVersion + 1, isEmpty: this.elements.length === 0 });
    } else if (this.silentChange) this.emit();
  }

  private commit(): void {
    if (this.history.commit({ elements: this.elements, files: this.files })) {
      this.setState({ canUndo: this.history.canUndo, canRedo: this.history.canRedo });
      this.scheduleSave();
    }
  }

  toast(message: string): void {
    window.clearTimeout(this.toastTimer);
    this.setState({ toast: { id: Date.now(), message } });
    this.toastTimer = window.setTimeout(() => this.setState({ toast: null }), 3200);
  }

  // ─── Startup ─────────────────────────────────────────────────────────────

  private initPromise: Promise<void> | null = null;

  /** Load preferences, fonts and the saved board. Safe to call more than once. */
  init(): Promise<void> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  private async load(): Promise<void> {
    const prefs = loadPrefs();
    const styles = structuredClone(DEFAULT_STYLES);
    if (prefs.styles && typeof prefs.styles === "object") {
      for (const group of Object.keys(styles) as StyleGroup[]) {
        if (prefs.styles[group]) styles[group] = restoreStyleProps(prefs.styles[group], DEFAULT_STYLES[group]);
      }
    }
    this.setState({
      theme: prefs.theme === "dark" ? "dark" : "light",
      canvas: restoreCanvas(prefs.canvas) ?? this.state.canvas,
      snap: prefs.snap === true,
      styles,
    });

    await loadBoardFonts();

    try {
      const saved = await loadBoard();
      if (saved) {
        this.elements = saved.elements;
        this.files = saved.files;
        const viewport = loadViewport() ?? saved.viewport;
        if (viewport) this.setState({ viewport });
      }
    } catch {
      this.toast("This browser is blocking storage — use Save to file to keep your board.");
    }
    this.history.reset({ elements: this.elements, files: this.files });
    // What was just loaded is already on disk; don't write it straight back.
    this.savedElements = this.elements;
    this.savedFiles = this.files;
    this.announcedElements = this.elements;
    this.setState({ ready: true, sceneVersion: this.state.sceneVersion + 1, isEmpty: this.elements.length === 0 });
    this.requestRender();
    await this.handleUrl();
  }

  private async handleUrl(): Promise<void> {
    const hash = location.hash.slice(1);
    const params = new URLSearchParams(location.search);
    const template = params.get("template");
    if (hash.startsWith(SHARE_PREFIX)) {
      history.replaceState(null, "", location.pathname + location.search);
      try {
        const data = await decodeShare(hash.slice(SHARE_PREFIX.length));
        if (this.elements.length === 0) this.replaceBoard(data);
        else this.setState({ pendingShared: data });
      } catch (err) {
        this.toast(err instanceof Error ? err.message : "This share link could not be opened.");
      }
    } else if (template && isTemplateId(template)) {
      history.replaceState(null, "", location.pathname);
      // Wait a frame so the canvas has its size before fitting the template.
      requestAnimationFrame(() => this.insertTemplate(template));
    }
  }

  resolvePendingShared(accept: boolean): void {
    const data = this.state.pendingShared;
    this.setState({ pendingShared: null });
    if (accept && data) this.replaceBoard(data);
  }

  private replaceBoard(data: BoardData): void {
    this.finishEditing();
    this.files = { ...this.files, ...data.files };
    this.setState({ selectedIds: [] });
    if (data.canvas) this.setCanvas(data.canvas);
    this.setElements(data.elements, true);
    requestAnimationFrame(() => this.zoomToFit(false));
  }

  // ─── Mounting ────────────────────────────────────────────────────────────

  mount(canvas: HTMLCanvasElement, container: HTMLElement): () => void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const ro = new ResizeObserver(() => this.resize(container));
    ro.observe(container);
    this.resize(container);

    const opts: AddEventListenerOptions = { passive: false };
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      o?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, o);
      return () => target.removeEventListener(type, fn as EventListener, o);
    };
    const offs = [
      on(canvas, "pointerdown", this.onPointerDown),
      on(canvas, "pointermove", this.onPointerMove),
      on(canvas, "pointerup", this.onPointerUp),
      on(canvas, "pointercancel", this.onPointerCancel),
      on(canvas, "dblclick", this.onDoubleClick),
      on(canvas, "wheel", this.onWheel, opts),
      on(canvas, "pointerleave", () => {
        if (this.interaction.kind === "none") this.lastWorld = null;
        this.setHover(null);
      }),
      on(container, "dragover", (e: DragEvent) => {
        if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
      }),
      on(container, "drop", this.onDrop),
    ];
    const win: [string, EventListener][] = [
      ["keydown", this.onKeyDown as EventListener],
      ["keyup", this.onKeyUp as EventListener],
      ["blur", () => (this.spaceDown = false)],
      ["pagehide", () => this.flushSave()],
    ];
    for (const [t, fn] of win) window.addEventListener(t, fn);
    const doc: [string, EventListener][] = [
      ["copy", this.onCopy as EventListener],
      ["cut", this.onCut as EventListener],
      ["paste", this.onPaste as EventListener],
      ["visibilitychange", () => document.visibilityState === "hidden" && this.flushSave()],
    ];
    for (const [t, fn] of doc) document.addEventListener(t, fn);

    return () => {
      ro.disconnect();
      offs.forEach((off) => off());
      for (const [t, fn] of win) window.removeEventListener(t, fn);
      for (const [t, fn] of doc) document.removeEventListener(t, fn);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.flushSave();
      this.canvas = null;
      this.ctx = null;
    };
  }

  private resize(container: HTMLElement): void {
    if (!this.canvas) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.render();
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  requestRender(): void {
    if (this.raf || !this.ctx) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private sceneOptions(): SceneRenderOptions {
    const editing = this.state.editing;
    return {
      viewport: this.state.viewport,
      width: this.width,
      height: this.height,
      pixelRatio: this.dpr,
      background: this.state.canvas.background,
      pattern: this.state.canvas.pattern,
      images: this.images,
      files: this.files,
      hiddenIds: editing?.kind === "text" ? new Set([editing.id]) : undefined,
      hiddenLabelIds: editing?.kind === "label" ? new Set([editing.id]) : undefined,
      fadedIds: this.interaction.kind === "erase" ? this.interaction.hits : undefined,
      darkMode: this.state.theme === "dark",
    };
  }

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now();
    const scene = this.sceneOptions();
    renderScene(ctx, this.elements, scene);

    // Trails fade from the tail; the trail still being drawn stays even when momentarily empty.
    for (const trail of this.laserTrails) {
      let expired = 0;
      while (expired < trail.length && now - trail[expired].t >= LASER_LIFETIME) expired++;
      if (expired) trail.splice(0, expired);
    }
    this.laserTrails = this.laserTrails.filter((t) => t.length > 0 || t === this.activeLaser);
    this.eraserTrail = this.eraserTrail.filter((p) => now - p.t < ERASER_LIFETIME);

    const selected = this.getSelectedElements();
    const overlay: OverlayState = {
      selected: this.state.editing ? [] : selected,
      frame: null,
      handles: { corners: false, edges: false, rotation: false },
      linearEdit: null,
      marquee:
        this.interaction.kind === "marquee"
          ? {
              minX: Math.min(this.interaction.start[0], this.interaction.current[0]),
              minY: Math.min(this.interaction.start[1], this.interaction.current[1]),
              maxX: Math.max(this.interaction.start[0], this.interaction.current[0]),
              maxY: Math.max(this.interaction.start[1], this.interaction.current[1]),
            }
          : null,
      bindTarget: this.bindTarget,
      hover: null,
      drawing: this.drawing,
      laserTrails: this.laserTrails,
      eraserTrail: this.eraserTrail,
      now,
    };
    const hideFrame =
      this.state.editing ||
      this.interaction.kind === "create-shape" ||
      this.interaction.kind === "create-linear" ||
      this.interaction.kind === "linear-multi";
    if (!hideFrame) {
      const frame = this.selectionFrame(selected);
      // While dragging, the frame follows the selection but its handles step aside.
      const dragging = this.interaction.kind === "move" && this.interaction.moved;
      if (frame) {
        overlay.frame = frame.box;
        if (!dragging) overlay.handles = frame.handles;
      }
      if (selected.length === 1 && isLinear(selected[0]) && !dragging) overlay.linearEdit = selected[0];
    }
    // What a click would grab: a light outline under the pointer.
    if (this.hoverId && this.interaction.kind === "none" && this.state.tool === "select" && !this.state.editing) {
      overlay.hover = this.elements.find((el) => el.id === this.hoverId) ?? null;
    }
    renderOverlay(ctx, overlay, scene);

    const trailsAlive =
      this.laserTrails.some((t) => t.length > 0) || this.eraserTrail.length > 0;
    if (trailsAlive) this.requestRender();
  }

  private selectionFrame(selected: readonly BoardElement[]): { box: TransformBox; handles: OverlayState["handles"] } | null {
    if (selected.length === 0) return null;
    if (selected.length === 1) {
      const el = selected[0];
      if (isLinear(el)) return null;
      const small = Math.min(el.width, el.height) * this.state.viewport.zoom < 24;
      const cornersOnly = el.type === "text" || el.type === "image";
      return { box: boxFromElement(el), handles: { corners: true, edges: !cornersOnly && !small, rotation: true } };
    }
    const b = getCommonBounds(selected);
    return { box: boxFromBounds(b), handles: { corners: true, edges: true, rotation: true } };
  }

  // ─── Coordinates ─────────────────────────────────────────────────────────

  private screenPoint(e: { clientX: number; clientY: number }): Vec {
    const rect = this.canvas?.getBoundingClientRect();
    return [e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0)];
  }

  screenToWorld(sx: number, sy: number): Vec {
    const v = this.state.viewport;
    return [sx / v.zoom + v.x, sy / v.zoom + v.y];
  }

  worldToScreen(wx: number, wy: number): Vec {
    const v = this.state.viewport;
    return [(wx - v.x) * v.zoom, (wy - v.y) * v.zoom];
  }

  private tolerance(): number {
    return (this.pointerType === "touch" ? 14 : 7) / this.state.viewport.zoom;
  }

  private snap(v: number): number {
    return this.state.snap ? Math.round(v / GRID_SIZE) * GRID_SIZE : v;
  }

  // ─── Viewport ────────────────────────────────────────────────────────────

  private setViewport(v: Viewport): void {
    this.setState({ viewport: v }, "frame");
    this.requestRender();
    this.scheduleSave();
  }

  zoomAt(sx: number, sy: number, zoom: number): void {
    const v = this.state.viewport;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const [wx, wy] = this.screenToWorld(sx, sy);
    if (v.zoom === z) return;
    this.setViewport({ x: wx - sx / z, y: wy - sy / z, zoom: z });
  }

  zoomBy(factor: number): void {
    this.zoomAt(this.width / 2, this.height / 2, this.state.viewport.zoom * factor);
  }

  zoomIn = () => this.zoomBy(1.2);
  zoomOut = () => this.zoomBy(1 / 1.2);
  resetZoom = () => this.zoomAt(this.width / 2, this.height / 2, 1);

  private fitBounds(b: Bounds, maxZoom: number): void {
    if (!isFiniteBounds(b) || this.width === 0) return;
    const pad = this.width < 720 ? 32 : 96;
    const bw = Math.max(b.maxX - b.minX, 1);
    const bh = Math.max(b.maxY - b.minY, 1);
    const zoom = clamp(Math.min((this.width - pad * 2) / bw, (this.height - pad * 2 - 64) / bh), MIN_ZOOM, maxZoom);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.setViewport({ x: cx - this.width / 2 / zoom, y: cy - this.height / 2 / zoom, zoom });
  }

  zoomToFit = (selectionOnly = false): void => {
    const els = selectionOnly ? this.getSelectedElements() : this.elements;
    if (els.length === 0) {
      if (!selectionOnly) this.setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    this.fitBounds(getCommonBounds(els), selectionOnly ? 3 : 1);
  };

  // ─── Tools ───────────────────────────────────────────────────────────────

  setTool = (tool: Tool): void => {
    this.finishEditing();
    this.finishMultiPoint();
    if (tool === "image") {
      this.openImagePicker();
      return;
    }
    const patch: Partial<EditorState> = { tool };
    if (isShapeType(tool)) patch.lastShape = tool;
    if (tool === "arrow" || tool === "line") patch.lastLinear = tool;
    if (tool === "pen" || tool === "highlighter" || tool === "laser") patch.lastDraw = tool;
    if (tool !== "select") patch.selectedIds = [];
    this.setState(patch);
    this.updateCursor();
    this.requestRender();
  };

  toggleToolLock = (): void => this.setState({ toolLocked: !this.state.toolLocked });

  private afterCreate(): void {
    if (!this.state.toolLocked) this.setState({ tool: "select" });
    this.updateCursor();
  }

  private updateCursor(hover?: string): void {
    if (!this.canvas) return;
    let cursor = "default";
    const t = this.state.tool;
    if (this.interaction.kind === "pan") cursor = "grabbing";
    else if (this.spaceDown || t === "hand") cursor = "grab";
    else if (t === "text") cursor = "text";
    else if (t === "eraser")
      cursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='7' fill='white' stroke='%23495057' stroke-width='1.5'/%3E%3C/svg%3E") 10 10, crosshair`;
    else if (t !== "select") cursor = "crosshair";
    else if (hover) cursor = hover;
    this.canvas.style.cursor = cursor;
  }

  // ─── Selection helpers ───────────────────────────────────────────────────

  getSelectedElements(): BoardElement[] {
    if (this.state.selectedIds.length === 0) return [];
    const set = new Set(this.state.selectedIds);
    return this.elements.filter((el) => set.has(el.id));
  }

  private select(ids: string[]): void {
    const cur = this.state.selectedIds;
    if (ids.length === cur.length && ids.every((id, i) => id === cur[i])) return;
    // A marquee re-selects on every move: the canvas shows it live, the panel catches up on release.
    this.setState({ selectedIds: ids }, this.interaction.kind === "marquee" ? "silent" : "now");
    this.requestRender();
  }

  /** Grow a set of ids to cover every member of their outermost groups. */
  private expandGroups(ids: Iterable<string>): string[] {
    const set = new Set(ids);
    const outer = new Set<string>();
    for (const el of this.elements) if (set.has(el.id) && el.groupIds.length) outer.add(el.groupIds[el.groupIds.length - 1]);
    if (outer.size) for (const el of this.elements) if (el.groupIds.some((g) => outer.has(g))) set.add(el.id);
    return this.elements.filter((el) => set.has(el.id)).map((el) => el.id);
  }

  selectAll = (): void => {
    this.finishEditing();
    this.setState({ tool: "select" });
    this.select(this.elements.map((el) => el.id));
  };

  clearSelection(): void {
    if (this.state.selectedIds.length) this.select([]);
  }

  private replaceElements(updated: ReadonlyMap<string, BoardElement>): BoardElement[] {
    return this.elements.map((el) => updated.get(el.id) ?? el);
  }

  // ─── Pointer input ───────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    // Until the saved board has loaded, a stroke would be overwritten by it.
    if (!this.canvas || !this.state.ready) return;
    this.pointerType = e.pointerType;
    this.setHover(null);
    const sp = this.screenPoint(e);
    this.pointers.set(e.pointerId, sp);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; nothing to do.
    }

    if (this.pointers.size === 2) {
      this.cancelInteraction();
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    if (this.state.editing) {
      this.finishEditing();
      if (this.state.tool === "select" || this.state.tool === "text") return;
    }
    if (this.state.dialog) this.setState({ dialog: null });

    this.gestureStart = this.elements;
    const world = this.screenToWorld(sp[0], sp[1]);
    this.lastWorld = world;

    if (e.button === 1 || (e.button === 0 && (this.spaceDown || this.state.tool === "hand"))) {
      this.interaction = { kind: "pan", lastX: sp[0], lastY: sp[1] };
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;

    if (this.interaction.kind === "linear-multi") {
      this.multiPointClick(sp, world);
      return;
    }

    // Every shape tool (from SHAPE_TYPES) plus sticky notes — never a hand-kept list,
    // which is how the six newer shapes silently did nothing on the canvas.
    const tool = this.state.tool;
    if (isShapeType(tool) || tool === "sticky") {
      this.startCreateShape(tool, world);
      return;
    }

    switch (tool) {
      case "select":
        this.selectDown(e, sp, world);
        break;
      case "arrow":
      case "line":
        this.startCreateLinear(tool, world);
        break;
      case "pen":
      case "highlighter":
        this.startDraw(tool, world, e);
        break;
      case "laser":
        this.interaction = { kind: "laser" };
        this.activeLaser = [{ x: world[0], y: world[1], t: performance.now() }];
        this.laserTrails.push(this.activeLaser);
        this.requestRender();
        break;
      case "text":
        this.textDown(world);
        break;
      case "eraser":
        this.interaction = { kind: "erase", hits: new Set(), last: world };
        this.eraseAlong(world, world);
        break;
      default:
        break;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const sp = this.screenPoint(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, sp);
    const world = this.screenToWorld(sp[0], sp[1]);
    this.lastWorld = world;
    const it = this.interaction;

    switch (it.kind) {
      case "none":
        if (e.pointerType === "mouse" && this.state.tool === "select") this.updateHoverCursor(sp, world);
        return;
      case "pan": {
        const v = this.state.viewport;
        this.setViewport({ ...v, x: v.x - (sp[0] - it.lastX) / v.zoom, y: v.y - (sp[1] - it.lastY) / v.zoom });
        it.lastX = sp[0];
        it.lastY = sp[1];
        return;
      }
      case "pinch":
        this.updatePinch();
        return;
      case "marquee":
        it.current = world;
        this.updateMarquee(it);
        return;
      case "move":
        this.updateMove(it, world, e);
        return;
      case "resize":
        this.updateResize(it, world, e);
        return;
      case "rotate":
        this.updateRotate(it, world, e);
        return;
      case "point":
        this.updatePoint(it, world, e);
        return;
      case "create-shape":
        this.updateCreateShape(it, world, e);
        return;
      case "create-linear":
        this.updateLinearEnd(it.id, world, e.shiftKey, it.startBinding);
        return;
      case "linear-multi":
        this.updateLinearEnd(it.id, world, e.shiftKey, null);
        return;
      case "draw":
        this.extendDraw(e);
        return;
      case "laser":
        this.activeLaser?.push({ x: world[0], y: world[1], t: performance.now() });
        this.requestRender();
        return;
      case "erase":
        this.eraseAlong(it.last, world);
        it.last = world;
        return;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    const it = this.interaction;
    if (it.kind === "pinch") {
      if (this.pointers.size === 0) this.interaction = { kind: "none" };
      return;
    }
    if (this.pointers.size > 0) return;
    const sp = this.screenPoint(e);

    switch (it.kind) {
      case "pan":
        this.interaction = { kind: "none" };
        this.updateCursor();
        break;
      case "marquee":
        this.interaction = { kind: "none" };
        this.requestRender();
        break;
      case "move":
        this.interaction = { kind: "none" };
        if (it.moved) this.commit();
        else if (it.clickDeselect) {
          const remove = new Set(it.clickDeselect);
          this.select(this.state.selectedIds.filter((id) => !remove.has(id)));
        } else if (it.clickSelect) this.select(it.clickSelect);
        break;
      case "resize":
      case "rotate": {
        this.interaction = { kind: "none" };
        // Shapes that were squeezed below their label grow back to fit it.
        const ids = new Set(it.originals.map((o) => o.id));
        const next = this.elements.map((el) => (ids.has(el.id) && isShape(el) && el.label ? fitShapeToLabel(el) : el));
        this.setElements(updateBoundArrows(next, ids), true);
        break;
      }
      case "point":
        this.interaction = { kind: "none" };
        this.bindTarget = null;
        this.setElements(this.elements, it.moved);
        this.requestRender();
        break;
      case "create-shape":
        this.finishCreateShape(it);
        break;
      case "create-linear":
        this.finishCreateLinear(it, sp);
        break;
      case "draw":
        this.finishDraw();
        break;
      case "laser":
        this.interaction = { kind: "none" };
        this.activeLaser = null;
        this.requestRender();
        break;
      case "erase": {
        this.interaction = { kind: "none" };
        if (it.hits.size) {
          const ids = new Set(this.expandGroups(it.hits));
          this.setElements(pruneBindings(this.elements.filter((el) => !ids.has(el.id))), true);
        }
        this.requestRender();
        break;
      }
      default:
        break;
    }
    this.gestureStart = null;
    // The gesture is over: let the UI catch up with the scene once.
    this.announceScene();
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && this.interaction.kind !== "linear-multi") {
      if (this.interaction.kind !== "none" && this.interaction.kind !== "pinch") this.cancelInteraction();
      this.interaction = { kind: "none" };
    }
  };

  /** Abandon whatever the first finger started (a second finger means pinch/pan). */
  private cancelInteraction(): void {
    if (this.gestureStart && this.gestureStart !== this.elements) this.setElements(this.gestureStart);
    this.drawing = null;
    this.bindTarget = null;
    if (this.interaction.kind === "linear-multi") this.setState({ multiPoint: false });
    if (this.interaction.kind === "laser") this.activeLaser = null;
    this.interaction = { kind: "none" };
    this.announceScene();
    this.requestRender();
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.interaction = {
      kind: "pinch",
      startDist: Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1),
      startZoom: this.state.viewport.zoom,
      anchor: this.screenToWorld(mid[0], mid[1]),
    };
  }

  private updatePinch(): void {
    const it = this.interaction;
    if (it.kind !== "pinch" || this.pointers.size < 2) return;
    const [a, b] = [...this.pointers.values()];
    const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const zoom = clamp((it.startZoom * dist) / it.startDist, MIN_ZOOM, MAX_ZOOM);
    this.setViewport({ x: it.anchor[0] - mid[0] / zoom, y: it.anchor[1] - mid[1] / zoom, zoom });
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const sp = this.screenPoint(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
    if (e.ctrlKey || e.metaKey) {
      const d = clamp(e.deltaY * unit, -60, 60);
      this.zoomAt(sp[0], sp[1], this.state.viewport.zoom * Math.exp(-d * 0.01));
      return;
    }
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    const v = this.state.viewport;
    this.setViewport({ ...v, x: v.x + dx / v.zoom, y: v.y + dy / v.zoom });
  };

  // ─── Select tool ─────────────────────────────────────────────────────────

  private handleAt(sp: Vec): { id: HandleId; angle: number } | null {
    const selected = this.getSelectedElements();
    const frame = this.selectionFrame(selected);
    if (!frame) return null;
    const r = this.pointerType === "touch" ? HANDLE_HIT_TOUCH : HANDLE_HIT_MOUSE;
    const handles = getHandles(frame.box, this.state.viewport.zoom, frame.handles.corners, frame.handles.edges, frame.handles.rotation);
    for (const h of handles) {
      const [hx, hy] = this.worldToScreen(h.x, h.y);
      if (Math.hypot(hx - sp[0], hy - sp[1]) <= r) return { id: h.id, angle: frame.box.angle };
    }
    return null;
  }

  /** Point handle (or segment midpoint) of the single selected arrow/line under the pointer. */
  private linearHandleAt(sp: Vec): { el: LinearElement; index: number; midpoint: boolean } | null {
    const sel = this.getSelectedElements();
    if (sel.length !== 1 || !isLinear(sel[0])) return null;
    const el = sel[0];
    const r = this.pointerType === "touch" ? HANDLE_HIT_TOUCH : HANDLE_HIT_MOUSE + 2;
    const pts = linearWorldPoints(el).map(([x, y]) => this.worldToScreen(x, y));
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i][0] - sp[0], pts[i][1] - sp[1]) <= r) return { el, index: i, midpoint: false };
    }
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2;
      const my = (pts[i - 1][1] + pts[i][1]) / 2;
      if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 36) continue;
      if (Math.hypot(mx - sp[0], my - sp[1]) <= r) return { el, index: i - 1, midpoint: true };
    }
    return null;
  }

  private updateHoverCursor(sp: Vec, world: Vec): void {
    let hover: string | null = null;
    if (this.linearHandleAt(sp)) this.updateCursor("pointer");
    else {
      const h = this.handleAt(sp);
      if (h) this.updateCursor(handleCursor(h.id, h.angle));
      else {
        const hit = getElementAtPoint(this.elements, world[0], world[1], this.tolerance());
        this.updateCursor(hit ? "move" : undefined);
        if (hit && !this.state.selectedIds.includes(hit.id)) hover = hit.id;
      }
    }
    this.setHover(hover);
  }

  private setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.requestRender();
  }

  private selectDown(e: PointerEvent, sp: Vec, world: Vec): void {
    const lh = this.linearHandleAt(sp);
    if (lh) {
      let original = lh.el;
      let index = lh.index;
      if (lh.midpoint) {
        const pts = original.points.slice();
        const a = pts[index];
        const b = pts[index + 1];
        pts.splice(index + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        original = { ...original, points: pts };
        index += 1;
        this.setElements(this.replaceElements(new Map([[original.id, original]])));
      }
      this.interaction = { kind: "point", id: original.id, index, original, moved: lh.midpoint };
      return;
    }

    const handle = this.handleAt(sp);
    if (handle) {
      const selected = this.getSelectedElements();
      const frame = this.selectionFrame(selected);
      if (frame) {
        if (handle.id === "rotate") {
          const center: Vec = [frame.box.x + frame.box.width / 2, frame.box.y + frame.box.height / 2];
          this.interaction = {
            kind: "rotate",
            originals: selected,
            center,
            startAngle: Math.atan2(world[1] - center[1], world[0] - center[0]),
          };
        } else {
          this.interaction = { kind: "resize", handle: handle.id, originals: selected, box: frame.box };
        }
        return;
      }
    }

    const hit = getElementAtPoint(this.elements, world[0], world[1], this.tolerance());
    const selectedSet = new Set(this.state.selectedIds);
    if (hit) {
      const group = this.expandGroups([hit.id]);
      const alreadySelected = selectedSet.has(hit.id);
      let clickSelect: string[] | null = null;
      let clickDeselect: string[] | null = null;
      if (e.shiftKey) {
        if (alreadySelected) clickDeselect = group;
        else this.select([...this.state.selectedIds, ...group]);
      } else if (!alreadySelected) {
        this.select(group);
      } else if (this.state.selectedIds.length > group.length) {
        clickSelect = group;
      }
      this.startMove(world, e.altKey, clickSelect, clickDeselect);
      return;
    }

    const selected = this.getSelectedElements();
    const frame = this.selectionFrame(selected);
    if (frame && !e.shiftKey) {
      const inside =
        selected.length === 1
          ? pointInElementBox(selected[0], world[0], world[1], 4 / this.state.viewport.zoom)
          : world[0] >= frame.box.x && world[0] <= frame.box.x + frame.box.width && world[1] >= frame.box.y && world[1] <= frame.box.y + frame.box.height;
      if (inside) {
        this.startMove(world, e.altKey, null, null);
        return;
      }
    }

    const base = e.shiftKey ? this.state.selectedIds : [];
    if (!e.shiftKey) this.clearSelection();
    this.interaction = { kind: "marquee", start: world, current: world, base };
  }

  private startMove(world: Vec, duplicate: boolean, clickSelect: string[] | null, clickDeselect: string[] | null): void {
    const originals = new Map(this.getSelectedElements().map((el) => [el.id, el] as const));
    this.interaction = { kind: "move", start: world, originals, moved: false, duplicate, clickSelect, clickDeselect };
  }

  private updateMove(it: Extract<Interaction, { kind: "move" }>, world: Vec, e: PointerEvent): void {
    let dx = world[0] - it.start[0];
    let dy = world[1] - it.start[1];
    if (!it.moved) {
      const z = this.state.viewport.zoom;
      if (Math.hypot(dx * z, dy * z) < CLICK_SLOP) return;
      it.moved = true;
      if (it.duplicate || e.altKey) {
        // Alt-drag: leave the originals in place and drag fresh copies.
        const copies = this.cloneElements([...it.originals.values()], 0, 0);
        this.setElements([...this.elements, ...copies]);
        it.originals = new Map(copies.map((c) => [c.id, c] as const));
        this.select(copies.map((c) => c.id));
      }
      // Arrows being dragged away from shapes that are staying put let go of them.
      for (const [id, el] of it.originals) {
        if (!isLinear(el)) continue;
        const s = el.startBinding && !it.originals.has(el.startBinding.elementId);
        const en = el.endBinding && !it.originals.has(el.endBinding.elementId);
        if (s || en) it.originals.set(id, { ...el, startBinding: s ? null : el.startBinding, endBinding: en ? null : el.endBinding });
      }
    }
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (this.state.snap && it.originals.size) {
      const b = getCommonBounds([...it.originals.values()]);
      dx = this.snap(b.minX + dx) - b.minX;
      dy = this.snap(b.minY + dy) - b.minY;
    }
    const updated = new Map<string, BoardElement>();
    for (const [id, el] of it.originals) updated.set(id, translateElement(el, dx, dy));
    const next = updateBoundArrows(this.replaceElements(updated), new Set(it.originals.keys()));
    this.setElements(next);
  }

  private updateMarquee(it: Extract<Interaction, { kind: "marquee" }>): void {
    const box: Bounds = {
      minX: Math.min(it.start[0], it.current[0]),
      minY: Math.min(it.start[1], it.current[1]),
      maxX: Math.max(it.start[0], it.current[0]),
      maxY: Math.max(it.start[1], it.current[1]),
    };
    // Elements fully inside the box are selected, together with the rest of their group.
    const inside = this.elements.filter((el) => boundsContain(box, getElementBounds(el))).map((el) => el.id);
    this.select(this.expandGroups([...it.base, ...inside]));
  }

  private updateResize(it: Extract<Interaction, { kind: "resize" }>, world: Vec, e: PointerEvent): void {
    let px = world[0];
    let py = world[1];
    if (this.state.snap) {
      px = this.snap(px);
      py = this.snap(py);
    }
    let changed: BoardElement[];
    if (it.originals.length === 1) {
      changed = [resizeElement(it.originals[0], it.handle, px, py, { keepAspect: e.shiftKey, fromCenter: e.altKey })];
    } else {
      changed = resizeGroup(it.originals, it.box, it.handle, px, py, e.altKey);
    }
    const map = new Map(changed.map((c) => [c.id, c] as const));
    this.setElements(updateBoundArrows(this.replaceElements(map), new Set(map.keys())));
  }

  private updateRotate(it: Extract<Interaction, { kind: "rotate" }>, world: Vec, e: PointerEvent): void {
    let changed: BoardElement[];
    if (it.originals.length === 1) {
      changed = [rotateElement(it.originals[0], world[0], world[1], e.shiftKey)];
    } else {
      let delta = Math.atan2(world[1] - it.center[1], world[0] - it.center[0]) - it.startAngle;
      if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
      changed = rotateGroup(it.originals, it.center[0], it.center[1], delta);
    }
    const map = new Map(changed.map((c) => [c.id, c] as const));
    this.setElements(updateBoundArrows(this.replaceElements(map), new Set(map.keys())));
  }

  private updatePoint(it: Extract<Interaction, { kind: "point" }>, world: Vec, e: PointerEvent): void {
    const orig = it.original;
    const pts = linearWorldPoints(orig);
    const last = pts.length - 1;
    const isEnd = it.index === 0 || it.index === last;
    let target: Vec = [this.snap(world[0]), this.snap(world[1])];
    if (e.shiftKey) {
      const neighbor = pts[it.index === 0 ? 1 : it.index - 1];
      const [sx, sy] = snapAngle(target[0] - neighbor[0], target[1] - neighbor[1]);
      target = [neighbor[0] + sx, neighbor[1] + sy];
    }
    let startBinding = orig.startBinding;
    let endBinding = orig.endBinding;
    this.bindTarget = null;
    if (isEnd) {
      const bindable = getBindableAt(this.elements, world[0], world[1], 12 / this.state.viewport.zoom, orig.id);
      const neighbor = pts[it.index === 0 ? 1 : last - 1];
      if (bindable && pts.length >= 2) {
        const snapped = outlinePointToward(bindable, neighbor[0], neighbor[1]);
        if (snapped) target = snapped;
        this.bindTarget = bindable;
      }
      const binding = bindable ? { elementId: bindable.id } : null;
      if (it.index === 0) startBinding = binding;
      else endBinding = binding;
    }
    pts[it.index] = target;
    let next = normalizeLinear({ ...orig, x: 0, y: 0, points: pts, startBinding, endBinding });
    next = applyBindings(next, new Map(this.elements.map((el) => [el.id, el] as const)));
    it.moved = true;
    this.setElements(this.replaceElements(new Map([[next.id, next]])));
  }

  // ─── Creating shapes ─────────────────────────────────────────────────────

  private styleFor(group: StyleGroup): StyleProps {
    return this.state.styles[group];
  }

  private startCreateShape(tool: ShapeTool, world: Vec): void {
    const start: Vec = [this.snap(world[0]), this.snap(world[1])];
    const group = tool === "sticky" ? "sticky" : "shape";
    const el = newShape(tool, start[0], start[1], 0, 0, this.styleFor(group));
    this.setElements([...this.elements, el]);
    this.select([]);
    this.interaction = { kind: "create-shape", id: el.id, start, tool };
  }

  private updateCreateShape(it: Extract<Interaction, { kind: "create-shape" }>, world: Vec, e: PointerEvent): void {
    let w = this.snap(world[0]) - it.start[0];
    let h = this.snap(world[1]) - it.start[1];
    if (e.shiftKey || it.tool === "sticky") {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * s;
    }
    let x = w < 0 ? it.start[0] + w : it.start[0];
    let y = h < 0 ? it.start[1] + h : it.start[1];
    let W = Math.abs(w);
    let H = Math.abs(h);
    if (e.altKey) {
      x = it.start[0] - W;
      y = it.start[1] - H;
      W *= 2;
      H *= 2;
    }
    const el = this.elements.find((x2) => x2.id === it.id);
    if (!el) return;
    this.setElements(this.replaceElements(new Map([[it.id, { ...el, x, y, width: W, height: H }]])));
  }

  private finishCreateShape(it: Extract<Interaction, { kind: "create-shape" }>): void {
    this.interaction = { kind: "none" };
    let el = this.elements.find((x) => x.id === it.id);
    if (!el || !isShape(el)) return;
    const z = this.state.viewport.zoom;
    if (el.width * z < 6 && el.height * z < 6) {
      // A click (or tap) places a shape at a sensible default size.
      const [w, h] = DEFAULT_SIZES[it.tool] ?? [170, 110];
      el = { ...el, x: it.start[0] - w / 2, y: it.start[1] - h / 2, width: w, height: h };
    }
    this.setElements(this.replaceElements(new Map([[el.id, el]])), true);
    this.select([el.id]);
    this.afterCreate();
    if (it.tool === "sticky") this.startEditing(el.id, "label");
  }

  private startCreateLinear(tool: LinearTool, world: Vec): void {
    const start: Vec = [this.snap(world[0]), this.snap(world[1])];
    const bindable = getBindableAt(this.elements, world[0], world[1], 10 / this.state.viewport.zoom);
    const el: LinearElement = {
      ...newLinear(tool, start[0], start[1], [
        [0, 0],
        [0, 0],
      ], this.styleFor(tool)),
      startBinding: bindable ? { elementId: bindable.id } : null,
    };
    this.setElements([...this.elements, el]);
    this.select([]);
    this.interaction = { kind: "create-linear", id: el.id, start, startBinding: bindable?.id ?? null };
  }

  /**
   * Move the free end of an arrow being drawn, snapping to shapes under the pointer.
   * The shape the arrow started on is skipped, so dragging out of it never loops back.
   */
  private updateLinearEnd(id: string, world: Vec, shift: boolean, startShapeId: string | null): void {
    const el = this.elements.find((x) => x.id === id);
    if (!el || !isLinear(el)) return;
    const pts = linearWorldPoints(el);
    const last = pts.length - 1;
    const anchor = pts[last - 1];
    let target: Vec = [this.snap(world[0]), this.snap(world[1])];
    if (shift) {
      const [sx, sy] = snapAngle(target[0] - anchor[0], target[1] - anchor[1]);
      target = [anchor[0] + sx, anchor[1] + sy];
    }
    const tol = 12 / this.state.viewport.zoom;
    const candidates = startShapeId ? this.elements.filter((x) => x.id !== startShapeId) : this.elements;
    const bindable = getBindableAt(candidates, world[0], world[1], tol, id);
    this.bindTarget = bindable;
    pts[last] = target;
    let next = normalizeLinear({ ...el, x: 0, y: 0, points: pts, endBinding: bindable ? { elementId: bindable.id } : null });
    next = applyBindings(next, new Map(this.elements.map((x) => [x.id, x] as const)));
    this.setElements(this.replaceElements(new Map([[id, next]])));
  }

  private finishCreateLinear(it: Extract<Interaction, { kind: "create-linear" }>, sp: Vec): void {
    const el = this.elements.find((x) => x.id === it.id);
    if (!el || !isLinear(el)) {
      this.interaction = { kind: "none" };
      return;
    }
    const [sx, sy] = this.worldToScreen(it.start[0], it.start[1]);
    if (Math.hypot(sp[0] - sx, sp[1] - sy) < 6 && !el.endBinding) {
      // A click instead of a drag: keep adding points with each click until finished.
      this.interaction = { kind: "linear-multi", id: el.id, lastScreen: [sx, sy] };
      this.setState({ multiPoint: true });
      return;
    }
    this.interaction = { kind: "none" };
    this.bindTarget = null;
    this.setElements(this.elements, true);
    this.select([el.id]);
    this.afterCreate();
  }

  private multiPointClick(sp: Vec, world: Vec): void {
    const it = this.interaction;
    if (it.kind !== "linear-multi") return;
    const el = this.elements.find((x) => x.id === it.id);
    if (!el || !isLinear(el)) return;
    // Clicking the previous point again, or landing on a shape, finishes the line.
    if (Math.hypot(sp[0] - it.lastScreen[0], sp[1] - it.lastScreen[1]) < 8 || el.endBinding) {
      this.finishMultiPoint();
      return;
    }
    const pts = linearWorldPoints(el);
    pts[pts.length - 1] = [this.snap(world[0]), this.snap(world[1])];
    pts.push([this.snap(world[0]), this.snap(world[1])]);
    const next = normalizeLinear({ ...el, x: 0, y: 0, points: pts });
    this.setElements(this.replaceElements(new Map([[next.id, next]])));
    it.lastScreen = sp;
  }

  finishMultiPoint = (): void => {
    const it = this.interaction;
    if (it.kind !== "linear-multi") return;
    this.interaction = { kind: "none" };
    this.bindTarget = null;
    this.setState({ multiPoint: false });
    const el = this.elements.find((x) => x.id === it.id);
    if (!el || !isLinear(el)) return;
    let pts = linearWorldPoints(el);
    // Drop the floating preview point unless it is attached to a shape.
    if (!el.endBinding && pts.length > 2) pts = pts.slice(0, -1);
    const deduped = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
    if (deduped.length < 2) {
      this.setElements(this.elements.filter((x) => x.id !== el.id), true);
      return;
    }
    const next = normalizeLinear({ ...el, x: 0, y: 0, points: deduped });
    this.setElements(this.replaceElements(new Map([[next.id, next]])), true);
    this.select([next.id]);
    this.afterCreate();
  };

  // ─── Freehand ────────────────────────────────────────────────────────────

  private startDraw(tool: "pen" | "highlighter", world: Vec, e: PointerEvent): void {
    const pressure = e.pointerType === "pen" && e.pressure > 0;
    this.drawing = newDraw(world[0], world[1], [[0, 0, pressure ? e.pressure : 0.5]], tool, !pressure, this.styleFor(tool));
    this.interaction = { kind: "draw" };
    this.select([]);
    this.requestRender();
  }

  private extendDraw(e: PointerEvent): void {
    const d = this.drawing;
    if (!d) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    const added: [number, number, number][] = [];
    for (const ev of list) {
      const sp = this.screenPoint(ev);
      const [wx, wy] = this.screenToWorld(sp[0], sp[1]);
      added.push([wx - d.x, wy - d.y, d.simulatePressure ? 0.5 : ev.pressure || 0.5]);
    }
    this.drawing = { ...d, points: [...d.points, ...added] };
    this.requestRender();
  }

  private finishDraw(): void {
    this.interaction = { kind: "none" };
    const d = this.drawing;
    this.drawing = null;
    if (!d) return;
    const el = normalizeDraw(d);
    this.setElements([...this.elements, el], true);
    this.requestRender();
  }

  // ─── Eraser ──────────────────────────────────────────────────────────────

  private eraseAlong(from: Vec, to: Vec): void {
    const it = this.interaction;
    if (it.kind !== "erase") return;
    const z = this.state.viewport.zoom;
    const steps = Math.max(1, Math.ceil((Math.hypot(to[0] - from[0], to[1] - from[1]) * z) / 4));
    const tol = (this.pointerType === "touch" ? 10 : 6) / z;
    for (let i = 0; i <= steps; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      const hit = getElementAtPoint(this.elements, x, y, tol, (el) => !it.hits.has(el.id));
      if (hit) for (const id of this.expandGroups([hit.id])) it.hits.add(id);
    }
    this.eraserTrail.push({ x: to[0], y: to[1], t: performance.now() });
    this.requestRender();
  }

  // ─── Text ────────────────────────────────────────────────────────────────

  private textDown(world: Vec): void {
    const hit = getElementAtPoint(this.elements, world[0], world[1], this.tolerance());
    if (hit && hit.type === "text") {
      this.startEditing(hit.id, "text");
      return;
    }
    if (hit && (isShape(hit) || isLinear(hit))) {
      this.startEditing(hit.id, "label");
      return;
    }
    this.createTextAt(world);
  }

  private createTextAt(world: Vec): void {
    const style = this.styleFor("text");
    const lh = style.fontSize * LINE_HEIGHT;
    const el = newText(this.snap(world[0]), this.snap(world[1] - lh / 2), "", style);
    this.setElements([...this.elements, el]);
    this.startEditing(el.id, "text");
  }

  startEditing(id: string, kind: "text" | "label"): void {
    this.select([id]);
    this.setState({ editing: { id, kind } });
    this.requestRender();
  }

  /** Where the text box overlay sits on screen for the element being edited. */
  getEditLayout(): EditLayout | null {
    const editing = this.state.editing;
    if (!editing) return null;
    const el = this.elements.find((x) => x.id === editing.id);
    if (!el) return null;
    const v = this.state.viewport;
    const z = v.zoom;
    const lh = el.fontSize * LINE_HEIGHT;
    const base = { fontFamily: FONT_STACKS[el.fontFamily], fontSize: el.fontSize * z, color: el.strokeColor };

    if (el.type === "text") {
      const extra = el.fontSize;
      let boxX = el.x;
      if (el.textAlign === "center") boxX -= extra / 2;
      else if (el.textAlign === "right") boxX -= extra;
      const [left, top] = this.worldToScreen(boxX, el.y);
      return {
        ...base,
        left,
        top,
        width: (el.width + extra) * z,
        height: Math.max(el.height, lh) * z,
        angle: el.angle,
        originX: (el.x + el.width / 2 - boxX) * z,
        originY: (el.height / 2) * z,
        align: el.textAlign,
        wrap: false,
        value: el.text,
      };
    }
    if (isShape(el)) {
      // The same layout the canvas draws with (an actor's name sits under the figure).
      const area = layoutShapeLabel(el);
      const height = Math.max(lh, area.height);
      const localLeft = area.cx - area.width / 2;
      const localTop = el.type === "actor" ? el.height + 6 : area.cy - height / 2;
      const [left, top] = this.worldToScreen(el.x + localLeft, el.y + localTop);
      return {
        ...base,
        left,
        top,
        width: area.width * z,
        height: height * z,
        angle: el.angle,
        originX: (el.width / 2 - localLeft) * z,
        originY: (el.height / 2 - localTop) * z,
        align: el.textAlign,
        wrap: true,
        value: el.label,
      };
    }
    if (isLinear(el)) {
      const l = layoutLinearLabel(el);
      const width = Math.max(l.width, 24) + el.fontSize;
      const height = Math.max(l.height, lh);
      const [left, top] = this.worldToScreen(l.worldX - width / 2, l.worldY - height / 2);
      return {
        ...base,
        left,
        top,
        width: width * z,
        height: height * z,
        angle: 0,
        originX: 0,
        originY: 0,
        align: "center",
        wrap: false,
        value: el.label,
      };
    }
    return null;
  }

  setEditingText(value: string): void {
    const editing = this.state.editing;
    if (!editing) return;
    const el = this.elements.find((x) => x.id === editing.id);
    if (!el) return;
    let next: BoardElement = el;
    if (el.type === "text") next = remeasureText({ ...el, text: value });
    else if (isShape(el)) next = fitShapeToLabel({ ...el, label: value });
    else if (isLinear(el)) next = { ...el, label: value };
    const updated = updateBoundArrows(this.replaceElements(new Map([[el.id, next]])), new Set([el.id]));
    this.setElements(updated);
  }

  finishEditing = (): void => {
    const editing = this.state.editing;
    if (!editing) return;
    this.setState({ editing: null });
    const el = this.elements.find((x) => x.id === editing.id);
    if (el && el.type === "text" && el.text.trim() === "") {
      this.setElements(pruneBindings(this.elements.filter((x) => x.id !== el.id)), true);
      this.select([]);
    } else {
      this.setElements(this.elements, true);
      if (el && this.state.tool === "text") {
        this.afterCreate();
        this.select([el.id]);
      }
    }
    this.requestRender();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (this.interaction.kind === "linear-multi") {
      this.finishMultiPoint();
      return;
    }
    if (this.state.tool !== "select") return;
    const sp = this.screenPoint(e);
    const world = this.screenToWorld(sp[0], sp[1]);
    const lh = this.linearHandleAt(sp);
    if (lh && !lh.midpoint && lh.el.points.length > 2) {
      // Double-clicking a bend removes it.
      const pts = linearWorldPoints(lh.el).filter((_, i) => i !== lh.index);
      let next = normalizeLinear({ ...lh.el, x: 0, y: 0, points: pts });
      next = applyBindings(next, new Map(this.elements.map((el) => [el.id, el] as const)));
      this.setElements(this.replaceElements(new Map([[next.id, next]])), true);
      return;
    }
    const hit = getElementAtPoint(this.elements, world[0], world[1], this.tolerance());
    if (hit?.type === "text") this.startEditing(hit.id, "text");
    else if (hit && (isShape(hit) || isLinear(hit))) this.startEditing(hit.id, "label");
    else if (!hit) this.createTextAt(world);
  };

  // ─── Keyboard ────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isEditableTarget(e.target)) return;
    if (this.state.dialog || this.state.pendingShared) {
      if (e.key === "Escape") this.setState({ dialog: null });
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.key === " " && !mod) {
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursor();
      }
      e.preventDefault();
      return;
    }

    if (mod) {
      let handled = true;
      if (key === "z" && !e.shiftKey) this.undo();
      else if ((key === "z" && e.shiftKey) || key === "y") this.redo();
      else if (key === "a") this.selectAll();
      else if (key === "d") this.duplicateSelected();
      else if (key === "g" && e.shiftKey) this.ungroupSelected();
      else if (key === "g") this.groupSelected();
      else if (key === "s") this.saveToFile();
      else if (key === "o") this.openFilePicker();
      else if (key === "e" && e.shiftKey) this.openDialog("export");
      else if (key === "=" || key === "+") this.zoomIn();
      else if (key === "-") this.zoomOut();
      else if (key === "0") this.resetZoom();
      else if (e.code === "BracketRight") this.moveLayers(e.shiftKey ? "front" : "forward");
      else if (e.code === "BracketLeft") this.moveLayers(e.shiftKey ? "back" : "backward");
      else handled = false;
      if (handled) e.preventDefault();
      return;
    }

    if (e.shiftKey && e.code === "Digit1") {
      this.zoomToFit(false);
      e.preventDefault();
      return;
    }
    if (e.shiftKey && e.code === "Digit2") {
      this.zoomToFit(true);
      e.preventDefault();
      return;
    }
    if (e.key === "?") {
      this.openDialog("shortcuts");
      return;
    }

    switch (e.key) {
      case "Escape":
        if (this.interaction.kind === "linear-multi") this.finishMultiPoint();
        else if (this.state.selectedIds.length) this.clearSelection();
        else if (this.state.tool !== "select") this.setTool("select");
        return;
      case "Enter": {
        if (this.interaction.kind === "linear-multi") {
          this.finishMultiPoint();
          return;
        }
        const sel = this.getSelectedElements();
        if (sel.length === 1) {
          const el = sel[0];
          if (el.type === "text") this.startEditing(el.id, "text");
          else if (isShape(el) || isLinear(el)) this.startEditing(el.id, "label");
          e.preventDefault();
        }
        return;
      }
      case "Delete":
      case "Backspace":
        this.deleteSelected();
        e.preventDefault();
        return;
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight": {
        if (!this.state.selectedIds.length) return;
        const step = e.shiftKey ? GRID_SIZE / 2 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        this.nudge(dx, dy);
        e.preventDefault();
        return;
      }
    }
    if (e.altKey || e.repeat) return;
    const tools: Record<string, Tool> = {
      v: "select",
      "1": "select",
      h: "hand",
      r: "rectangle",
      "2": "rectangle",
      d: "diamond",
      "3": "diamond",
      o: "ellipse",
      "4": "ellipse",
      a: "arrow",
      "5": "arrow",
      l: "line",
      "6": "line",
      p: "pen",
      "7": "pen",
      t: "text",
      "8": "text",
      "9": "image",
      e: "eraser",
      "0": "eraser",
      n: "sticky",
      m: "highlighter",
      k: "laser",
    };
    if (key === "q") {
      this.toggleToolLock();
      return;
    }
    const tool = tools[key];
    if (tool) {
      this.setTool(tool);
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === " ") {
      this.spaceDown = false;
      this.updateCursor();
    }
  };

  // ─── Clipboard & drop ────────────────────────────────────────────────────

  private onCopy = (e: ClipboardEvent): void => {
    if (isEditableTarget(e.target) || this.state.editing) return;
    const sel = this.getSelectedElements();
    if (!sel.length) return;
    const text = serializeClipboard(sel, this.files);
    this.internalClipboard = text;
    e.clipboardData?.setData("text/plain", text);
    e.preventDefault();
  };

  private onCut = (e: ClipboardEvent): void => {
    if (isEditableTarget(e.target) || this.state.editing) return;
    this.onCopy(e);
    this.deleteSelected();
  };

  private onPaste = (e: ClipboardEvent): void => {
    if (isEditableTarget(e.target) || this.state.editing) return;
    const data = e.clipboardData;
    if (!data) return;
    const images = [...data.files].filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      e.preventDefault();
      void this.insertImages(images, this.lastWorld ?? undefined);
      return;
    }
    const text = data.getData("text/plain") || this.internalClipboard || "";
    const board = parseClipboard(text);
    e.preventDefault();
    if (board) {
      this.pasteElements(board);
      return;
    }
    if (text.trim()) {
      const at = this.lastWorld ?? this.viewportCenter();
      const el = newText(at[0], at[1], text.slice(0, 20000), this.styleFor("text"));
      this.setElements([...this.elements, { ...el, x: el.x - el.width / 2, y: el.y - el.height / 2 }], true);
      this.setState({ tool: "select" });
      this.select([el.id]);
    }
  };

  private onDrop = (e: DragEvent): void => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    const board = files.find((f) => f.name.endsWith(FILE_EXTENSION) || f.name.endsWith(".json"));
    if (board) {
      void this.openFile(board);
      return;
    }
    const sp = this.screenPoint(e);
    void this.insertImages(files, this.screenToWorld(sp[0], sp[1]));
  };

  private viewportCenter(): Vec {
    return this.screenToWorld(this.width / 2, this.height / 2);
  }

  /** Deep-copy elements with fresh ids, keeping bindings and groups that stay inside the copy. */
  private cloneElements(source: readonly BoardElement[], dx: number, dy: number): BoardElement[] {
    const idMap = new Map(source.map((el) => [el.id, randomId()] as const));
    const groupMap = new Map<string, string>();
    const mapGroup = (g: string) => {
      let id = groupMap.get(g);
      if (!id) {
        id = randomId();
        groupMap.set(g, id);
      }
      return id;
    };
    return source.map((el) => {
      const base = {
        ...el,
        id: idMap.get(el.id) ?? randomId(),
        x: el.x + dx,
        y: el.y + dy,
        groupIds: el.groupIds.map(mapGroup),
      };
      if (base.type === "arrow" || base.type === "line") {
        const s = base.startBinding && idMap.get(base.startBinding.elementId);
        const en = base.endBinding && idMap.get(base.endBinding.elementId);
        return { ...base, startBinding: s ? { elementId: s } : null, endBinding: en ? { elementId: en } : null };
      }
      return base;
    });
  }

  private pasteElements(board: BoardData): void {
    if (!board.elements.length) return;
    this.files = { ...this.files, ...board.files };
    const b = getCommonBounds(board.elements);
    const at = this.lastWorld ?? this.viewportCenter();
    const dx = this.snap(at[0] - (b.minX + b.maxX) / 2);
    const dy = this.snap(at[1] - (b.minY + b.maxY) / 2);
    const copies = this.cloneElements(board.elements, dx, dy);
    this.setElements([...this.elements, ...copies], true);
    this.setState({ tool: "select" });
    this.select(copies.map((c) => c.id));
  }

  // ─── Images ──────────────────────────────────────────────────────────────

  openImagePicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
    input.multiple = true;
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      if (files.length) void this.insertImages(files);
    };
    input.click();
  }

  async insertImages(fileList: File[], at?: Vec): Promise<void> {
    const allowed = fileList.filter((f) => /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(f.type)).slice(0, 12);
    if (!allowed.length) {
      this.toast("That file type isn't supported. Use PNG, JPG, GIF, WebP or SVG.");
      return;
    }
    const center = at ?? this.viewportCenter();
    const v = this.state.viewport;
    const maxW = (this.width * 0.5) / v.zoom;
    const maxH = (this.height * 0.5) / v.zoom;
    const created: BoardElement[] = [];
    let files = this.files;
    let offset = 0;
    for (const file of allowed) {
      try {
        const img = await readImage(file);
        const id = randomId();
        files = { ...files, [id]: { id, mimeType: img.mimeType, dataURL: img.dataURL } };
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        created.push(newImage(center[0] - w / 2 + offset, center[1] - h / 2 + offset, w, h, id, this.styleFor("image")));
        offset += 24 / v.zoom;
      } catch {
        this.toast(`Couldn't read ${file.name}.`);
      }
    }
    if (!created.length) return;
    this.files = files;
    this.setElements([...this.elements, ...created], true);
    this.setState({ tool: "select" });
    this.select(created.map((c) => c.id));
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  undo = (): void => {
    this.finishEditing();
    const snap = this.history.undo({ elements: this.elements, files: this.files });
    if (snap) this.applySnapshot(snap.elements, snap.files);
  };

  redo = (): void => {
    this.finishEditing();
    const snap = this.history.redo();
    if (snap) this.applySnapshot(snap.elements, snap.files);
  };

  private applySnapshot(elements: BoardElement[], files: FileMap): void {
    this.interaction = { kind: "none" };
    this.drawing = null;
    this.files = files;
    const ids = new Set(elements.map((el) => el.id));
    this.setState({
      selectedIds: this.state.selectedIds.filter((id) => ids.has(id)),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.setElements(elements);
    this.scheduleSave();
  }

  deleteSelected = (): void => {
    const ids = new Set(this.state.selectedIds);
    if (!ids.size) return;
    this.setState({ selectedIds: [] });
    this.setElements(pruneBindings(this.elements.filter((el) => !ids.has(el.id))), true);
  };

  duplicateSelected = (): void => {
    const sel = this.getSelectedElements();
    if (!sel.length) return;
    const offset = GRID_SIZE;
    const copies = this.cloneElements(sel, offset, offset);
    this.setElements([...this.elements, ...copies], true);
    this.select(copies.map((c) => c.id));
  };

  private nudge(dx: number, dy: number): void {
    const ids = new Set(this.state.selectedIds);
    const moved = this.elements.map((el) => (ids.has(el.id) ? translateElement(el, dx, dy) : el));
    this.setElements(updateBoundArrows(moved, ids), true);
  }

  groupSelected = (): void => {
    const ids = new Set(this.state.selectedIds);
    if (ids.size < 2) return;
    const gid = randomId();
    this.setElements(this.elements.map((el) => (ids.has(el.id) ? { ...el, groupIds: [...el.groupIds, gid] } : el)), true);
  };

  ungroupSelected = (): void => {
    const ids = new Set(this.state.selectedIds);
    if (!ids.size) return;
    this.setElements(
      this.elements.map((el) => (ids.has(el.id) && el.groupIds.length ? { ...el, groupIds: el.groupIds.slice(0, -1) } : el)),
      true,
    );
  };

  moveLayers = (dir: LayerMove): void => {
    const ids = new Set(this.state.selectedIds);
    if (!ids.size) return;
    const els = this.elements.slice();
    if (dir === "front") {
      this.setElements([...els.filter((el) => !ids.has(el.id)), ...els.filter((el) => ids.has(el.id))], true);
      return;
    }
    if (dir === "back") {
      this.setElements([...els.filter((el) => ids.has(el.id)), ...els.filter((el) => !ids.has(el.id))], true);
      return;
    }
    if (dir === "forward") {
      for (let i = els.length - 2; i >= 0; i--) {
        if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
      }
    } else {
      for (let i = 1; i < els.length; i++) {
        if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
    }
    this.setElements(els, true);
  };

  /** Selected elements grouped into units: a group moves as one piece when aligning. */
  private selectionUnits(): BoardElement[][] {
    const units = new Map<string, BoardElement[]>();
    for (const el of this.getSelectedElements()) {
      const key = el.groupIds.length ? el.groupIds[el.groupIds.length - 1] : el.id;
      const list = units.get(key);
      if (list) list.push(el);
      else units.set(key, [el]);
    }
    return [...units.values()];
  }

  private shiftUnits(moves: { unit: BoardElement[]; dx: number; dy: number }[]): void {
    const updated = new Map<string, BoardElement>();
    for (const { unit, dx, dy } of moves) for (const el of unit) updated.set(el.id, translateElement(el, dx, dy));
    this.setElements(updateBoundArrows(this.replaceElements(updated), new Set(updated.keys())), true);
  }

  align = (kind: AlignKind): void => {
    const units = this.selectionUnits();
    if (units.length < 2) return;
    const all = getCommonBounds(units.flat());
    this.shiftUnits(
      units.map((unit) => {
        const b = getCommonBounds(unit);
        let dx = 0;
        let dy = 0;
        if (kind === "left") dx = all.minX - b.minX;
        if (kind === "right") dx = all.maxX - b.maxX;
        if (kind === "hcenter") dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2;
        if (kind === "top") dy = all.minY - b.minY;
        if (kind === "bottom") dy = all.maxY - b.maxY;
        if (kind === "vcenter") dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2;
        return { unit, dx, dy };
      }),
    );
  };

  distribute = (axis: "horizontal" | "vertical"): void => {
    const units = this.selectionUnits();
    if (units.length < 3) return;
    const h = axis === "horizontal";
    const withBounds = units.map((unit) => ({ unit, b: getCommonBounds(unit) }));
    withBounds.sort((a, b) => (h ? a.b.minX + a.b.maxX - (b.b.minX + b.b.maxX) : a.b.minY + a.b.maxY - (b.b.minY + b.b.maxY)));
    const first = withBounds[0].b;
    const last = withBounds[withBounds.length - 1].b;
    const span = h ? last.maxX - first.minX : last.maxY - first.minY;
    const sizes = withBounds.reduce((sum, { b }) => sum + (h ? b.maxX - b.minX : b.maxY - b.minY), 0);
    const gap = (span - sizes) / (withBounds.length - 1);
    let cursor = h ? first.minX : first.minY;
    this.shiftUnits(
      withBounds.map(({ unit, b }) => {
        const d = cursor - (h ? b.minX : b.minY);
        cursor += (h ? b.maxX - b.minX : b.maxY - b.minY) + gap;
        return { unit, dx: h ? d : 0, dy: h ? 0 : d };
      }),
    );
  };

  /** Apply a style change to the selection (or, with nothing selected, to the active tool's defaults). */
  updateStyle = (patch: Partial<StyleProps>, commit = true): void => {
    const sel = this.getSelectedElements();
    const styles = { ...this.state.styles };
    if (sel.length) {
      const ids = new Set(sel.map((el) => el.id));
      const next = this.elements.map((el) => (ids.has(el.id) ? applyStyle(el, patch) : el));
      for (const el of sel) {
        const group = styleGroupOf(el);
        const allowed = new Set(propsForElement(el).flatMap(fieldsOf));
        const relevant = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k as keyof StyleProps)));
        styles[group] = { ...styles[group], ...relevant };
      }
      this.setState({ styles });
      this.setElements(updateBoundArrows(next, ids), commit);
    } else {
      const group = styleGroupOfTool(this.state.tool);
      if (!group) return;
      styles[group] = { ...styles[group], ...patch };
      this.setState({ styles });
    }
    this.savePrefsNow();
  };

  /** Commit a change made through a live control (e.g. the opacity slider). */
  commitStyle = (): void => this.commit();

  // ─── Dialogs, canvas settings ────────────────────────────────────────────

  openDialog = (dialog: Exclude<DialogName, null>): void => {
    this.finishEditing();
    this.setState({ dialog });
  };

  closeDialog = (): void => this.setState({ dialog: null });

  setTheme = (theme: "light" | "dark"): void => {
    this.setState({ theme });
    this.savePrefsNow();
    this.requestRender();
  };

  setCanvas = (patch: Partial<CanvasSettings>): void => {
    this.setState({ canvas: { ...this.state.canvas, ...patch } });
    this.savePrefsNow();
    this.requestRender();
  };

  toggleSnap = (): void => {
    this.setState({ snap: !this.state.snap });
    this.savePrefsNow();
  };

  insertTemplate = (id: TemplateId): void => {
    this.finishEditing();
    const els = buildScene(id);
    if (!els.length) return;
    const b = getCommonBounds(els);
    let dx: number;
    let dy: number;
    if (this.elements.length === 0) {
      const c = this.viewportCenter();
      dx = c[0] - (b.minX + b.maxX) / 2;
      dy = c[1] - (b.minY + b.maxY) / 2;
    } else {
      // Place it beside what is already on the board, never on top of it.
      const all = getCommonBounds(this.elements);
      dx = all.maxX + 160 - b.minX;
      dy = all.minY - b.minY;
    }
    const moved = els.map((el) => translateElement(el, Math.round(dx), Math.round(dy)));
    this.setState({ dialog: null, tool: "select" });
    this.setElements([...this.elements, ...moved], true);
    this.select(moved.map((el) => el.id));
    this.fitBounds(getCommonBounds(moved), 1);
  };

  resetCanvas = (): void => {
    this.finishEditing();
    this.setState({ selectedIds: [], dialog: null });
    this.setElements([], true);
    this.setViewport({ x: 0, y: 0, zoom: 1 });
  };

  // ─── Files ───────────────────────────────────────────────────────────────

  saveToFile = (): void => {
    const json = serializeBoard({ elements: this.elements, files: this.files, canvas: this.state.canvas });
    downloadBlob(new Blob([json], { type: "application/json" }), `whiteboard-${todayStamp()}${FILE_EXTENSION}`);
    this.toast("Board saved to your downloads.");
  };

  openFilePicker = (): void => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${FILE_EXTENSION},.json,application/json`;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.openFile(file);
    };
    input.click();
  };

  async openFile(file: File): Promise<void> {
    try {
      const data = parseBoard(await file.text());
      this.replaceBoard(data);
      this.toast(`Opened ${file.name}. Undo brings back your previous board.`);
    } catch (err) {
      this.toast(err instanceof Error ? err.message : "That file couldn't be opened.");
    }
  }

  async createShareLink(): Promise<{ url: string; droppedImages: number } | { error: string }> {
    if (!shareLinksSupported()) return { error: "This browser can't create share links. Save to file instead." };
    if (!this.elements.length) return { error: "The board is empty — draw something first." };
    const { payload, droppedImages } = await encodeShare(this.elements, this.state.canvas);
    const url = `${location.origin}${location.pathname}#${SHARE_PREFIX}${payload}`;
    if (url.length > SHARE_LIMIT) return { error: "This board is too big for a link. Save it to a file and send the file instead." };
    return { url, droppedImages };
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      // Writing a big board to IndexedDB copies all of it; do that while the page is idle.
      if (typeof requestIdleCallback === "function") requestIdleCallback(() => this.flushSave(), { timeout: 2000 });
      else this.flushSave();
    }, 600);
  }

  private flushSave(): void {
    if (!this.state.ready) return;
    window.clearTimeout(this.saveTimer);
    saveViewport(this.state.viewport);
    // Panning and zooming only move the viewport; the board itself is rewritten only when it changed.
    if (this.savedElements === this.elements && this.savedFiles === this.files) return;
    this.savedElements = this.elements;
    this.savedFiles = this.files;
    saveBoard({
      elements: this.elements,
      files: usedFiles(this.elements, this.files),
      viewport: this.state.viewport,
      savedAt: Date.now(),
    }).catch(() => {
      this.savedElements = null;
    });
  }

  private savePrefsNow(): void {
    savePrefs({ theme: this.state.theme, canvas: this.state.canvas, snap: this.state.snap, styles: this.state.styles });
  }
}

async function readImage(file: File): Promise<{ dataURL: string; mimeType: string; width: number; height: number }> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read")));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.src = original;
  await img.decode();
  let width = img.naturalWidth || 400;
  let height = img.naturalHeight || 300;
  const MAX = 2400;
  if (file.type !== "image/svg+xml" && file.type !== "image/gif" && (width > MAX || height > MAX || file.size > 4_000_000)) {
    const scale = Math.min(1, MAX / width, MAX / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" || file.type === "image/webp" ? "image/png" : "image/jpeg";
    width = canvas.width;
    height = canvas.height;
    return { dataURL: canvas.toDataURL(type, 0.9), mimeType: type, width, height };
  }
  return { dataURL: original, mimeType: file.type, width, height };
}

