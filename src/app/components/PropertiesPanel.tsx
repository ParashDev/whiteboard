import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Group,
  Trash2,
  Ungroup,
  X,
} from "lucide-react";
import { BACKGROUND_COLORS, FONT_SIZES, HIGHLIGHTER_COLORS, STICKY_COLORS, STROKE_COLORS } from "../../engine/constants";
import type { Editor } from "../../engine/editor";
import {
  fieldsOf,
  paletteFor,
  propsForElement,
  propsForGroup,
  styleGroupOf,
  styleGroupOfTool,
  type ColorPalette,
  type PropKey,
} from "../../engine/properties";
import type { Arrowhead, BoardElement, StyleGroup, StyleProps } from "../../engine/types";
import { useEditor, useEditorState, useIsCompact } from "../editor-context";
import { ArrowTypeIcon, ArrowheadIcon, EdgesIcon, FillIcon, SloppinessIcon, StrokeStyleIcon, StrokeWidthIcon } from "./icons";
import { IconButton, Popover, cx } from "./ui";

const ORDER: PropKey[] = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "edges",
  "curved",
  "arrowheads",
  "fontFamily",
  "fontSize",
  "textAlign",
  "opacity",
];

const PALETTES: Record<ColorPalette, string[]> = {
  stroke: STROKE_COLORS,
  background: BACKGROUND_COLORS,
  sticky: STICKY_COLORS,
  highlighter: HIGHLIGHTER_COLORS,
};

export interface StyleContext {
  keys: PropKey[];
  values: Partial<StyleProps>;
  groups: Set<StyleGroup>;
  selected: BoardElement[];
  anyFilled: boolean;
}

/** What the style panel shows right now, or null when there is nothing to style. */
export function useStyleContext(): StyleContext | null {
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const selectedIds = useEditorState((s) => s.selectedIds);
  const sceneVersion = useEditorState((s) => s.sceneVersion);
  const styles = useEditorState((s) => s.styles);

  return useMemo(() => {
    void sceneVersion;
    const selected = selectedIds.length ? editor.getSelectedElements() : [];
    if (selected.length) {
      const keySet = new Set<PropKey>();
      const perElement = selected.map((el) => {
        const keys = propsForElement(el);
        keys.forEach((k) => keySet.add(k));
        return { el, fields: new Set(keys.flatMap(fieldsOf)) };
      });
      const values: Partial<StyleProps> = {};
      for (const key of keySet) {
        for (const field of fieldsOf(key)) {
          const applicable = perElement.filter((p) => p.fields.has(field)).map((p) => p.el[field]);
          if (applicable.length && applicable.every((v) => v === applicable[0])) {
            (values as Record<string, unknown>)[field] = applicable[0];
          }
        }
      }
      return {
        keys: ORDER.filter((k) => keySet.has(k)),
        values,
        groups: new Set(selected.map(styleGroupOf)),
        selected,
        anyFilled: selected.some((el) => el.type !== "sticky" && el.backgroundColor !== "transparent"),
      };
    }
    const group = styleGroupOfTool(tool);
    if (!group) return null;
    const values = styles[group];
    return {
      keys: propsForGroup(group, tool),
      values,
      groups: new Set([group]),
      selected: [],
      anyFilled: values.backgroundColor !== "transparent",
    };
  }, [editor, tool, selectedIds, sceneVersion, styles]);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

function Option({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton size="sm" active={active} title={title} aria-label={title} onClick={onClick} className={active ? undefined : "bg-well"}>
      {children}
    </IconButton>
  );
}

function useDebouncedCommit(editor: Editor): () => void {
  const timer = useRef(0);
  return useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => editor.commitStyle(), 400);
  }, [editor]);
}

function ColorRow({ palette, value, field }: { palette: ColorPalette; value: string | undefined; field: "strokeColor" | "backgroundColor" }) {
  const editor = useEditor();
  const scheduleCommit = useDebouncedCommit(editor);
  const colors = PALETTES[palette];
  const custom = value && value !== "transparent" ? value : "#1e1e1e";
  const inPalette = value !== undefined && colors.includes(value);
  return (
    <div className="flex items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c === "transparent" ? "Transparent" : c}
          aria-label={c === "transparent" ? "Transparent" : `Colour ${c}`}
          aria-pressed={value === c}
          onClick={() => editor.updateStyle({ [field]: c })}
          className={cx(
            "focus-ring size-7 shrink-0 rounded-md ring-1 ring-black/10 ring-inset transition-[box-shadow] duration-100",
            c === "transparent" && "checker",
            value === c && "outline-2 outline-offset-2 outline-accent",
          )}
          style={c === "transparent" ? undefined : { backgroundColor: c }}
        />
      ))}
      <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
      <label
        title="Custom colour"
        className={cx(
          "focus-within:outline-accent relative size-7 shrink-0 cursor-pointer rounded-md ring-1 ring-black/10 ring-inset focus-within:outline-2 focus-within:outline-offset-2",
          value !== undefined && !inPalette && "outline-2 outline-offset-2 outline-accent",
        )}
        style={{ backgroundColor: custom }}
      >
        <span className="sr-only">Custom colour</span>
        <input
          type="color"
          value={custom.length === 7 ? custom : "#1e1e1e"}
          onChange={(e) => {
            editor.updateStyle({ [field]: e.target.value }, false);
            scheduleCommit();
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function ArrowheadPicker({ side, value }: { side: "start" | "end"; value: Arrowhead | undefined }) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const heads: Arrowhead[] = ["none", "arrow", "triangle", "dot", "bar"];
  const names: Record<Arrowhead, string> = { none: "None", arrow: "Arrow", triangle: "Triangle", dot: "Dot", bar: "Bar" };
  const field = side === "start" ? "startArrowhead" : "endArrowhead";
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${side === "start" ? "Start" : "End"}: ${value ? names[value] : "Mixed"}`}
        className="focus-ring flex h-8 items-center gap-1.5 rounded-lg bg-well px-2 text-[12px] text-muted hover:bg-hover"
      >
        <ArrowheadIcon head={value ?? "none"} flip={side === "start"} className="text-ink" />
        {side === "start" ? "Start" : "End"}
      </button>
      <Popover anchor={ref} open={open} onClose={close} placement="right-start" className="p-1.5" label="Arrowheads">
        <div className="flex gap-1">
          {heads.map((h) => (
            <IconButton
              key={h}
              size="sm"
              active={value === h}
              title={names[h]}
              aria-label={names[h]}
              onClick={() => {
                editor.updateStyle({ [field]: h });
                setOpen(false);
              }}
            >
              <ArrowheadIcon head={h} flip={side === "start"} />
            </IconButton>
          ))}
        </div>
      </Popover>
    </>
  );
}

export const PropertiesPanel = memo(function PropertiesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const editor = useEditor();
  const ctx = useStyleContext();
  const compact = useIsCompact();
  const set = useCallback((patch: Partial<StyleProps>) => editor.updateStyle(patch), [editor]);

  if (!ctx) return null;
  if (compact && !open) return null;

  const { keys, values: v, groups, selected } = ctx;
  const only = (g: StyleGroup) => groups.size === 1 && groups.has(g);
  const drawOnly = [...groups].every((g) => g === "pen" || g === "highlighter");
  const units = new Set(selected.map((el) => (el.groupIds.length ? el.groupIds[el.groupIds.length - 1] : el.id))).size;
  const grouped = selected.some((el) => el.groupIds.length > 0);

  const sections: ReactNode[] = [];
  for (const key of keys) {
    switch (key) {
      case "strokeColor":
        sections.push(
          <Section key={key} label={drawOnly || only("text") ? "Colour" : "Stroke"}>
            <ColorRow field="strokeColor" palette={paletteFor("strokeColor", groups)} value={v.strokeColor} />
          </Section>,
        );
        break;
      case "backgroundColor":
        sections.push(
          <Section key={key} label={only("sticky") ? "Note colour" : "Background"}>
            <ColorRow field="backgroundColor" palette={paletteFor("backgroundColor", groups)} value={v.backgroundColor} />
          </Section>,
        );
        break;
      case "fillStyle":
        if (!ctx.anyFilled) break;
        sections.push(
          <Section key={key} label="Fill">
            <Row>
              {(["hachure", "cross-hatch", "solid"] as const).map((f) => (
                <Option key={f} active={v.fillStyle === f} title={f === "hachure" ? "Hatched" : f === "cross-hatch" ? "Cross-hatched" : "Solid"} onClick={() => set({ fillStyle: f })}>
                  <FillIcon kind={f} />
                </Option>
              ))}
            </Row>
          </Section>,
        );
        break;
      case "strokeWidth":
        sections.push(
          <Section key={key} label={drawOnly ? "Size" : "Stroke width"}>
            <Row>
              {[1, 2, 4].map((w) => (
                <Option key={w} active={v.strokeWidth === w} title={w === 1 ? "Thin" : w === 2 ? "Bold" : "Extra bold"} onClick={() => set({ strokeWidth: w })}>
                  <StrokeWidthIcon w={w} />
                </Option>
              ))}
            </Row>
          </Section>,
        );
        break;
      case "strokeStyle":
        sections.push(
          <Section key={key} label="Stroke style">
            <Row>
              {(["solid", "dashed", "dotted"] as const).map((s) => (
                <Option key={s} active={v.strokeStyle === s} title={s[0].toUpperCase() + s.slice(1)} onClick={() => set({ strokeStyle: s })}>
                  <StrokeStyleIcon kind={s} />
                </Option>
              ))}
            </Row>
          </Section>,
        );
        break;
      case "roughness":
        sections.push(
          <Section key={key} label="Sloppiness">
            <Row>
              {([0, 1, 2] as const).map((r) => (
                <Option key={r} active={v.roughness === r} title={["Architect — clean lines", "Artist — hand-drawn", "Cartoonist — sketchy"][r]} onClick={() => set({ roughness: r })}>
                  <SloppinessIcon level={r} />
                </Option>
              ))}
            </Row>
          </Section>,
        );
        break;
      case "edges":
        sections.push(
          <Section key={key} label="Edges">
            <Row>
              <Option active={v.edges === "sharp"} title="Sharp" onClick={() => set({ edges: "sharp" })}>
                <EdgesIcon round={false} />
              </Option>
              <Option active={v.edges === "round"} title="Round" onClick={() => set({ edges: "round" })}>
                <EdgesIcon round />
              </Option>
            </Row>
          </Section>,
        );
        break;
      case "curved":
        sections.push(
          <Section key={key} label="Arrow type">
            <Row>
              <Option active={v.curved === false} title="Straight" onClick={() => set({ curved: false })}>
                <ArrowTypeIcon curved={false} />
              </Option>
              <Option active={v.curved === true} title="Curved (drag the midpoint to bend)" onClick={() => set({ curved: true })}>
                <ArrowTypeIcon curved />
              </Option>
            </Row>
          </Section>,
        );
        break;
      case "arrowheads":
        sections.push(
          <Section key={key} label="Arrowheads">
            <Row>
              <ArrowheadPicker side="start" value={v.startArrowhead} />
              <ArrowheadPicker side="end" value={v.endArrowhead} />
            </Row>
          </Section>,
        );
        break;
      case "fontFamily":
        sections.push(
          <Section key={key} label="Font">
            <Row>
              <Option active={v.fontFamily === "hand"} title="Hand-drawn" onClick={() => set({ fontFamily: "hand" })}>
                <span className="font-hand text-[15px] leading-none">Aa</span>
              </Option>
              <Option active={v.fontFamily === "sans"} title="Normal" onClick={() => set({ fontFamily: "sans" })}>
                <span className="font-sans text-[14px] leading-none font-medium">Aa</span>
              </Option>
              <Option active={v.fontFamily === "mono"} title="Code" onClick={() => set({ fontFamily: "mono" })}>
                <span className="font-mono text-[13px] leading-none">Aa</span>
              </Option>
            </Row>
          </Section>,
        );
        break;
      case "fontSize":
        sections.push(
          <Section key={key} label="Font size">
            <Row>
              {FONT_SIZES.map((s) => (
                <Option key={s.label} active={v.fontSize === s.value} title={`${s.value}px`} onClick={() => set({ fontSize: s.value })}>
                  <span className="text-[12.5px] font-medium">{s.label}</span>
                </Option>
              ))}
            </Row>
          </Section>,
        );
        break;
      case "textAlign":
        sections.push(
          <Section key={key} label="Text align">
            <Row>
              <Option active={v.textAlign === "left"} title="Left" onClick={() => set({ textAlign: "left" })}>
                <AlignLeft size={17} strokeWidth={1.75} />
              </Option>
              <Option active={v.textAlign === "center"} title="Centre" onClick={() => set({ textAlign: "center" })}>
                <AlignCenter size={17} strokeWidth={1.75} />
              </Option>
              <Option active={v.textAlign === "right"} title="Right" onClick={() => set({ textAlign: "right" })}>
                <AlignRight size={17} strokeWidth={1.75} />
              </Option>
            </Row>
          </Section>,
        );
        break;
      case "opacity":
        sections.push(
          <Section key={key} label="Opacity">
            <div className="flex items-center gap-3">
              <input
                type="range"
                className="range"
                min={10}
                max={100}
                step={5}
                value={v.opacity ?? 100}
                aria-label="Opacity"
                onChange={(e) => editor.updateStyle({ opacity: Number(e.target.value) }, false)}
                onPointerUp={editor.commitStyle}
                onKeyUp={editor.commitStyle}
              />
              <span className="w-8 text-right text-[12px] text-muted tabular-nums">{v.opacity ?? "—"}</span>
            </div>
          </Section>,
        );
        break;
    }
  }

  if (selected.length) {
    if (units >= 2) {
      sections.push(
        <Section key="align" label="Align">
          <Row>
            <IconButton size="sm" className="bg-well" title="Align left" aria-label="Align left" onClick={() => editor.align("left")}>
              <AlignStartVertical size={17} strokeWidth={1.75} />
            </IconButton>
            <IconButton size="sm" className="bg-well" title="Centre horizontally" aria-label="Centre horizontally" onClick={() => editor.align("hcenter")}>
              <AlignCenterVertical size={17} strokeWidth={1.75} />
            </IconButton>
            <IconButton size="sm" className="bg-well" title="Align right" aria-label="Align right" onClick={() => editor.align("right")}>
              <AlignEndVertical size={17} strokeWidth={1.75} />
            </IconButton>
            <IconButton size="sm" className="bg-well" title="Align top" aria-label="Align top" onClick={() => editor.align("top")}>
              <AlignStartHorizontal size={17} strokeWidth={1.75} />
            </IconButton>
            <IconButton size="sm" className="bg-well" title="Centre vertically" aria-label="Centre vertically" onClick={() => editor.align("vcenter")}>
              <AlignCenterHorizontal size={17} strokeWidth={1.75} />
            </IconButton>
            <IconButton size="sm" className="bg-well" title="Align bottom" aria-label="Align bottom" onClick={() => editor.align("bottom")}>
              <AlignEndHorizontal size={17} strokeWidth={1.75} />
            </IconButton>
            {units >= 3 && (
              <>
                <IconButton size="sm" className="bg-well" title="Distribute horizontally" aria-label="Distribute horizontally" onClick={() => editor.distribute("horizontal")}>
                  <AlignHorizontalDistributeCenter size={17} strokeWidth={1.75} />
                </IconButton>
                <IconButton size="sm" className="bg-well" title="Distribute vertically" aria-label="Distribute vertically" onClick={() => editor.distribute("vertical")}>
                  <AlignVerticalDistributeCenter size={17} strokeWidth={1.75} />
                </IconButton>
              </>
            )}
          </Row>
        </Section>,
      );
    }
    sections.push(
      <Section key="layers" label="Layers">
        <Row>
          <IconButton size="sm" className="bg-well" title="Send to back — Ctrl+Shift+[" aria-label="Send to back" onClick={() => editor.moveLayers("back")}>
            <ArrowDownToLine size={17} strokeWidth={1.75} />
          </IconButton>
          <IconButton size="sm" className="bg-well" title="Send backward — Ctrl+[" aria-label="Send backward" onClick={() => editor.moveLayers("backward")}>
            <ArrowDown size={17} strokeWidth={1.75} />
          </IconButton>
          <IconButton size="sm" className="bg-well" title="Bring forward — Ctrl+]" aria-label="Bring forward" onClick={() => editor.moveLayers("forward")}>
            <ArrowUp size={17} strokeWidth={1.75} />
          </IconButton>
          <IconButton size="sm" className="bg-well" title="Bring to front — Ctrl+Shift+]" aria-label="Bring to front" onClick={() => editor.moveLayers("front")}>
            <ArrowUpToLine size={17} strokeWidth={1.75} />
          </IconButton>
        </Row>
      </Section>,
    );
    sections.push(
      <Section key="actions" label="Actions">
        <Row>
          <IconButton size="sm" className="bg-well" title="Duplicate — Ctrl+D" aria-label="Duplicate" onClick={editor.duplicateSelected}>
            <Copy size={17} strokeWidth={1.75} />
          </IconButton>
          <IconButton size="sm" className="bg-well hover:text-danger" title="Delete — Delete" aria-label="Delete" onClick={editor.deleteSelected}>
            <Trash2 size={17} strokeWidth={1.75} />
          </IconButton>
          {units >= 2 && (
            <IconButton size="sm" className="bg-well" title="Group — Ctrl+G" aria-label="Group" onClick={editor.groupSelected}>
              <Group size={17} strokeWidth={1.75} />
            </IconButton>
          )}
          {grouped && (
            <IconButton size="sm" className="bg-well" title="Ungroup — Ctrl+Shift+G" aria-label="Ungroup" onClick={editor.ungroupSelected}>
              <Ungroup size={17} strokeWidth={1.75} />
            </IconButton>
          )}
        </Row>
      </Section>,
    );
  }

  if (!sections.length) return null;

  return (
    <aside
      aria-label="Style"
      // Buttons don't take focus, so a text being edited stays in edit mode while its font changes.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
      className={cx(
        "thin-scroll pointer-events-auto z-10 flex flex-col gap-4 overflow-y-auto rounded-xl bg-island p-3.5 shadow-island",
        compact
          ? "pop-in fixed right-2 bottom-[calc(66px+env(safe-area-inset-bottom))] left-2 max-h-[46dvh]"
          : "absolute top-[68px] left-3 max-h-[calc(100dvh-150px)] w-[226px]",
      )}
    >
      {compact && (
        <div className="-mb-1 flex items-center justify-between">
          <span className="text-[13px] font-semibold">Style</span>
          <IconButton size="sm" title="Close" aria-label="Close style panel" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}
      {sections}
    </aside>
  );
});
