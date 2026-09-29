import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FolderOpen,
  ImageDown,
  Keyboard,
  LayoutTemplate,
  Link2,
  Menu,
  Moon,
  Palette,
  Redo2,
  Scan,
  Sun,
  Trash2,
  Undo2,
} from "lucide-react";
import { CANVAS_BACKGROUNDS } from "../../engine/constants";
import { useEditor, useEditorState, useIsCompact } from "../editor-context";
import { useStyleContext } from "./PropertiesPanel";
import { IconButton, Kbd, Popover, cx } from "./ui";

const I = { size: 17, strokeWidth: 1.75 } as const;

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  href,
  danger,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string[];
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const cls = cx(
    "focus-ring flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13.5px] hover:bg-hover",
    danger ? "text-danger" : "text-ink",
  );
  const body = (
    <>
      <span className={danger ? "text-danger" : "text-muted"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="flex gap-1">
          {shortcut.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <a role="menuitem" href={href} className={cls}>
        {body}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function MainMenu() {
  const editor = useEditor();
  const theme = useEditorState((s) => s.theme);
  const background = useEditorState((s) => s.canvas.background);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <IconButton ref={ref} onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-haspopup="menu" aria-expanded={open} title="Menu">
        <Menu size={19} strokeWidth={1.75} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} placement="bottom-start" className="thin-scroll max-h-[calc(100dvh-80px)] w-[268px] overflow-y-auto p-1.5" label="Menu">
        <div role="menu" className="flex flex-col">
          {/* The way out on phones and installed apps, where there may be no browser back button. */}
          <MenuItem icon={<ArrowLeft {...I} />} label="Back to home" href="/" />
          <div className="my-1.5 h-px bg-line" />
          <MenuItem icon={<FolderOpen {...I} />} label="Open…" shortcut={["Ctrl", "O"]} onClick={run(editor.openFilePicker)} />
          <MenuItem icon={<Download {...I} />} label="Save to file" shortcut={["Ctrl", "S"]} onClick={run(editor.saveToFile)} />
          <MenuItem icon={<ImageDown {...I} />} label="Export image…" shortcut={["Ctrl", "⇧", "E"]} onClick={run(() => editor.openDialog("export"))} />
          <MenuItem icon={<Link2 {...I} />} label="Share a link…" onClick={run(() => editor.openDialog("share"))} />
          <MenuItem icon={<LayoutTemplate {...I} />} label="Templates…" onClick={run(() => editor.openDialog("templates"))} />
          <div className="my-1.5 h-px bg-line" />
          <MenuItem icon={<Scan {...I} />} label="Zoom to fit" shortcut={["⇧", "1"]} onClick={run(() => editor.zoomToFit(false))} />
          <MenuItem
            icon={theme === "dark" ? <Sun {...I} /> : <Moon {...I} />}
            label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => editor.setTheme(theme === "dark" ? "light" : "dark")}
          />
          <div className="px-2.5 pt-2 pb-2.5">
            <div className="mb-2 text-[12px] font-medium text-muted">Canvas background</div>
            <div className="flex gap-1.5">
              {CANVAS_BACKGROUNDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`Canvas background ${c}`}
                  aria-pressed={background === c}
                  onClick={() => editor.setCanvas({ background: c })}
                  className={cx(
                    "focus-ring size-7 rounded-md ring-1 ring-black/10 ring-inset",
                    background === c && "outline-2 outline-offset-2 outline-accent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="my-1.5 h-px bg-line" />
          <MenuItem icon={<Keyboard {...I} />} label="Keyboard shortcuts" shortcut={["?"]} onClick={run(() => editor.openDialog("shortcuts"))} />
          <MenuItem icon={<BookOpen {...I} />} label="How to use the whiteboard" href="/how-to-use-online-whiteboard/" />
          <div className="my-1.5 h-px bg-line" />
          <MenuItem icon={<Trash2 {...I} />} label="Clear the board…" danger onClick={run(() => editor.openDialog("reset"))} />
        </div>
      </Popover>
    </>
  );
}

export const TopLeft = memo(function TopLeft({ styleOpen, onToggleStyle }: { styleOpen: boolean; onToggleStyle: () => void }) {
  const editor = useEditor();
  const canUndo = useEditorState((s) => s.canUndo);
  const canRedo = useEditorState((s) => s.canRedo);
  const compact = useIsCompact();
  const styleCtx = useStyleContext();

  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-island p-1 shadow-island">
      <MainMenu />
      <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
      <IconButton onClick={editor.undo} disabled={!canUndo} title="Undo — Ctrl+Z" aria-label="Undo">
        <Undo2 size={18} strokeWidth={1.75} />
      </IconButton>
      <IconButton onClick={editor.redo} disabled={!canRedo} title="Redo — Ctrl+Shift+Z" aria-label="Redo">
        <Redo2 size={18} strokeWidth={1.75} />
      </IconButton>
      {compact && styleCtx && (
        <>
          <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
          <IconButton active={styleOpen} onClick={onToggleStyle} title="Style" aria-label="Style" aria-expanded={styleOpen}>
            <Palette size={18} strokeWidth={1.75} />
          </IconButton>
        </>
      )}
    </div>
  );
});
