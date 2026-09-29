import { memo, useCallback, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { Tool } from "../../engine/types";
import { useEditor, useEditorState, useIsCompact } from "../editor-context";
import { SLOTS, TOOLS, toolTitle, type Family, type Slot } from "../tools";
import { IconButton, Kbd, Popover, cx } from "./ui";

const ICON = { size: 19, strokeWidth: 1.75 } as const;

function FamilyButton({ slot, compact }: { slot: Extract<Slot, { kind: "family" }>; compact: boolean }) {
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const last = useEditorState((s) =>
    slot.family === "shape" ? s.lastShape : slot.family === "linear" ? s.lastLinear : s.lastDraw,
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const active = slot.tools.includes(tool);
  const current = active ? tool : last;
  const Icon = TOOLS[current].icon;

  const onClick = () => {
    if (!active) editor.setTool(current);
    setOpen((v) => !v);
  };
  const pick = (t: Tool) => {
    editor.setTool(t);
    setOpen(false);
  };

  return (
    <>
      <IconButton
        ref={ref}
        active={active}
        onClick={onClick}
        title={`${slot.label} — ${toolTitle(current)}`}
        aria-label={slot.label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon {...ICON} />
        <svg className="absolute right-[3px] bottom-[3px] opacity-55" width="5" height="5" viewBox="0 0 5 5" aria-hidden>
          <path d="M5 0v5H0z" fill="currentColor" />
        </svg>
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} placement={compact ? "top" : "bottom"} label={slot.label} className="p-1.5">
        <div role="menu" className="flex min-w-[196px] flex-col">
          {slot.tools.map((t) => {
            const info = TOOLS[t];
            const I = info.icon;
            const selected = tool === t;
            return (
              <button
                key={t}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => pick(t)}
                className={cx(
                  "focus-ring flex h-10 items-center gap-3 rounded-lg border px-2.5 text-left text-[13.5px]",
                  selected ? "border-active-line bg-active text-active-ink" : "border-transparent hover:bg-hover",
                )}
              >
                <I {...ICON} />
                <span className="flex-1">{info.label}</span>
                {info.key && <Kbd>{info.key}</Kbd>}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

export const Toolbar = memo(function Toolbar() {
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const locked = useEditorState((s) => s.toolLocked);
  const compact = useIsCompact();

  return (
    <nav
      aria-label="Tools"
      className={cx(
        "pointer-events-auto flex items-center rounded-xl bg-island p-1 shadow-island",
        compact
          ? "fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2 gap-0"
          : "absolute top-3 left-1/2 z-20 -translate-x-1/2 gap-0.5",
      )}
    >
      {SLOTS.map((slot) => {
        if (slot.kind === "family") return <FamilyButton key={slot.family as Family} slot={slot} compact={compact} />;
        const info = TOOLS[slot.tool];
        const Icon = info.icon;
        return (
          <IconButton
            key={slot.tool}
            active={tool === slot.tool}
            onClick={() => editor.setTool(slot.tool)}
            title={toolTitle(slot.tool)}
            aria-label={info.label}
          >
            <Icon {...ICON} />
          </IconButton>
        );
      })}
      {!compact && (
        <>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <IconButton
            active={locked}
            onClick={editor.toggleToolLock}
            title={locked ? "Tool stays active after drawing — Q" : "Keep the tool active after drawing — Q"}
            aria-label="Keep tool active"
          >
            {locked ? <Lock size={17} strokeWidth={1.75} /> : <LockOpen size={17} strokeWidth={1.75} />}
          </IconButton>
        </>
      )}
    </nav>
  );
});
