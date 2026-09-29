import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { Editor, EditorState } from "../engine/editor";

export const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditor must be used inside <EditorContext.Provider>");
  return editor;
}

/** Subscribe to one slice of editor state. Selectors must return primitives or existing references. */
export function useEditorState<T>(selector: (s: EditorState) => T): T {
  const editor = useEditor();
  return useSyncExternalStore(editor.subscribe, () => selector(editor.getState()));
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Phones get the bottom toolbar and a sheet-style style panel. */
export function useIsCompact(): boolean {
  return useMediaQuery("(max-width: 44.99rem)");
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function keyLabel(key: string): string {
  if (!isMac) return key;
  if (key === "Ctrl") return "⌘";
  if (key === "Alt") return "⌥";
  if (key === "Shift") return "⇧";
  return key;
}
