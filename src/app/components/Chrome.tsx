// The small pieces of chrome around the canvas: the empty-board welcome, the
// one-line tool hint, the footer credit and the toast.

import { memo } from "react";
import { FolderOpen, Keyboard, LayoutTemplate } from "lucide-react";
import { useEditor, useEditorState, useIsCompact } from "../editor-context";
import { Logo } from "./icons";
import { Button } from "./ui";

export const Welcome = memo(function Welcome() {
  const editor = useEditor();
  const ready = useEditorState((s) => s.ready);
  const isEmpty = useEditorState((s) => s.isEmpty);
  const tool = useEditorState((s) => s.tool);
  if (!ready || !isEmpty || (tool !== "select" && tool !== "hand")) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] grid place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center text-center">
        <Logo size={44} />
        <p className="mt-4 font-hand text-[26px] leading-tight text-ink">Pick a tool and start drawing</p>
        <p className="mt-1.5 text-[13.5px] text-muted">Your board saves in this browser as you go.</p>
        <div className="pointer-events-auto mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => editor.openDialog("templates")}>
            <LayoutTemplate size={16} strokeWidth={1.75} />
            Templates
          </Button>
          <Button onClick={editor.openFilePicker}>
            <FolderOpen size={16} strokeWidth={1.75} />
            Open a file
          </Button>
          <Button onClick={() => editor.openDialog("shortcuts")} className="hidden wide:inline-flex">
            <Keyboard size={16} strokeWidth={1.75} />
            Shortcuts
          </Button>
        </div>
      </div>
    </div>
  );
});

const HINTS: Partial<Record<string, string>> = {
  hand: "Drag to move around · scroll or pinch to zoom",
  text: "Click anywhere to type · double-click a shape to label it",
  arrow: "Drag between shapes to connect them · click to add bends",
  line: "Drag to draw · click to add bends",
  sticky: "Click to add a note, then type",
  eraser: "Drag across anything to erase it",
  laser: "Point at things — the trail fades on its own",
};

export const Hint = memo(function Hint() {
  const tool = useEditorState((s) => s.tool);
  const multiPoint = useEditorState((s) => s.multiPoint);
  const compact = useIsCompact();
  const text = multiPoint ? "Click to add points · Enter or Esc to finish" : HINTS[tool];
  if (!text || compact) return null;
  return (
    <div className="pointer-events-none absolute top-[62px] left-1/2 z-10 -translate-x-1/2 text-[12.5px] whitespace-nowrap text-muted">
      {text}
    </div>
  );
});

export const Footer = memo(function Footer() {
  const editor = useEditor();
  const compact = useIsCompact();
  if (compact) return null;
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-island/90 px-3 py-1.5 text-[12px] text-muted shadow-island">
      <a href="/" className="font-medium text-ink hover:underline">
        whiteboard.dplooy.com
      </a>
      <span aria-hidden>·</span>
      <span>
        Free, by{" "}
        <a href="https://www.dplooy.com" className="hover:text-ink hover:underline">
          Dplooy
        </a>
      </span>
      <span aria-hidden>·</span>
      <button type="button" onClick={() => editor.openDialog("shortcuts")} className="focus-ring rounded hover:text-ink hover:underline">
        Shortcuts
      </button>
    </div>
  );
});

export const Toast = memo(function Toast() {
  const toast = useEditorState((s) => s.toast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 wide:bottom-14">
      {toast && (
        <div key={toast.id} className="toast-in max-w-md rounded-lg bg-[#1f1f24] px-4 py-2.5 text-[13px] text-white shadow-pop">
          {toast.message}
        </div>
      )}
    </div>
  );
});
