import { memo, useEffect, useMemo, useRef } from "react";
import { useEditor, useEditorState } from "../editor-context";

/** A textarea laid exactly over the text (or shape label) being edited. */
export const TextEditor = memo(function TextEditor() {
  const editor = useEditor();
  const editing = useEditorState((s) => s.editing);
  const sceneVersion = useEditorState((s) => s.sceneVersion);
  const viewport = useEditorState((s) => s.viewport);
  const ref = useRef<HTMLTextAreaElement>(null);
  const layout = useMemo(() => {
    void sceneVersion;
    void viewport;
    return editing ? editor.getEditLayout() : null;
  }, [editor, editing, sceneVersion, viewport]);

  const editingKey = editing ? `${editing.id}:${editing.kind}` : "";
  useEffect(() => {
    if (!editingKey) return;
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [editingKey]);

  if (!editing || !layout) return null;
  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label={editing.kind === "text" ? "Text" : "Label"}
      value={layout.value}
      spellCheck
      wrap={layout.wrap ? "soft" : "off"}
      onChange={(e) => editor.setEditingText(e.target.value)}
      onBlur={editor.finishEditing}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          editor.finishEditing();
        }
      }}
      style={{
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        fontFamily: layout.fontFamily,
        fontSize: layout.fontSize,
        color: layout.color,
        textAlign: layout.align,
        whiteSpace: layout.wrap ? "pre-wrap" : "pre",
        overflowWrap: layout.wrap ? "break-word" : "normal",
        transform: layout.angle ? `rotate(${layout.angle}rad)` : undefined,
        transformOrigin: `${layout.originX}px ${layout.originY}px`,
        caretColor: "#0d9488",
      }}
    />
  );
});
