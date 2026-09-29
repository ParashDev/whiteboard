import { memo, useCallback, useRef, useState } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import type { CanvasPattern } from "../../engine/types";
import { useEditor, useEditorState } from "../editor-context";
import { PatternIcon } from "./icons";
import { IconButton, Popover, cx } from "./ui";

const PATTERNS: { id: CanvasPattern; label: string }[] = [
  { id: "plain", label: "Plain" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
];

function PatternMenu() {
  const editor = useEditor();
  const pattern = useEditorState((s) => s.canvas.pattern);
  const snap = useEditorState((s) => s.snap);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = PATTERNS.find((p) => p.id === pattern) ?? PATTERNS[0];

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Canvas pattern"
        className="focus-ring pointer-events-auto flex h-9 items-center gap-2 rounded-xl bg-island pr-2.5 pl-3 text-[13px] shadow-island hover:bg-hover"
      >
        <PatternIcon kind={current.id} width={16} height={16} className="text-muted" />
        {current.label}
        <ChevronDown size={15} strokeWidth={1.75} className="text-muted" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} placement="bottom-end" className="w-[200px] p-1.5" label="Canvas pattern">
        <div role="menu" className="flex flex-col">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={pattern === p.id}
              onClick={() => {
                editor.setCanvas({ pattern: p.id });
                setOpen(false);
              }}
              className={cx(
                "focus-ring flex h-9 items-center gap-3 rounded-lg border px-2.5 text-[13.5px]",
                pattern === p.id ? "border-active-line bg-active text-active-ink" : "border-transparent hover:bg-hover",
              )}
            >
              <PatternIcon kind={p.id} width={18} height={18} />
              {p.label}
            </button>
          ))}
          <div className="my-1.5 h-px bg-line" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={snap}
            onClick={editor.toggleSnap}
            className="focus-ring flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] hover:bg-hover"
          >
            <span
              className={cx(
                "grid size-[18px] place-items-center rounded-[5px] ring-1 ring-inset",
                snap ? "bg-accent text-accent-ink ring-accent" : "ring-faint",
              )}
            >
              {snap && <Check size={13} strokeWidth={2.5} />}
            </span>
            Snap to grid
          </button>
        </div>
      </Popover>
    </>
  );
}

export const ZoomControls = memo(function ZoomControls() {
  const editor = useEditor();
  const zoom = useEditorState((s) => s.viewport.zoom);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="pointer-events-auto flex items-center rounded-xl bg-island p-1 shadow-island">
        <IconButton onClick={editor.zoomOut} title="Zoom out — Ctrl+−" aria-label="Zoom out">
          <Minus size={17} strokeWidth={1.75} />
        </IconButton>
        <button
          type="button"
          onClick={editor.resetZoom}
          title="Reset to 100%"
          className="focus-ring h-9 min-w-[3.6rem] rounded-lg px-1.5 text-[13px] text-ink tabular-nums hover:bg-hover"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton onClick={editor.zoomIn} title="Zoom in — Ctrl++" aria-label="Zoom in">
          <Plus size={17} strokeWidth={1.75} />
        </IconButton>
      </div>
      <PatternMenu />
    </div>
  );
});
