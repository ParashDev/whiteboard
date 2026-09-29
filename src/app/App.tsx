import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "../engine/editor";
import { EditorContext } from "./editor-context";
import { Footer, Hint, Toast, Welcome } from "./components/Chrome";
import { Dialogs } from "./components/Dialogs";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { TextEditor } from "./components/TextEditor";
import { Toolbar } from "./components/Toolbar";
import { TopLeft } from "./components/TopLeft";
import { ZoomControls } from "./components/ZoomControls";

export function App({ editor }: { editor: Editor }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(editor.subscribe, () => editor.getState().theme);
  const [styleOpen, setStyleOpen] = useState(false);
  const toggleStyle = useCallback(() => setStyleOpen((v) => !v), []);
  const closeStyle = useCallback(() => setStyleOpen(false), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    return editor.mount(canvas, container);
  }, [editor]);

  useEffect(() => {
    void editor.init();
  }, [editor]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121212" : "#ffffff");
    try {
      localStorage.setItem("whiteboard:theme", theme);
    } catch {
      // Storage blocked: the theme simply isn't remembered before first paint.
    }
  }, [theme]);

  return (
    <EditorContext.Provider value={editor}>
      <div className="app-shell fixed inset-0 overflow-hidden">
        <h1 className="sr-only">Online whiteboard</h1>
        <div ref={containerRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="board-canvas" aria-label="Whiteboard canvas" />
        </div>
        <TextEditor />
        <Welcome />
        <Hint />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
          <TopLeft styleOpen={styleOpen} onToggleStyle={toggleStyle} />
          <ZoomControls />
        </div>
        <Toolbar />
        <PropertiesPanel open={styleOpen} onClose={closeStyle} />
        <Footer />
        <Toast />
        <Dialogs />
      </div>
    </EditorContext.Provider>
  );
}
