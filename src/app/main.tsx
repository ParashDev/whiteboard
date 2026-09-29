import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/app.css";
import { Editor } from "../engine/editor";
import { registerServiceWorker } from "../shared/sw";
import { App } from "./App";

const editor = new Editor();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App editor={editor} />
    </StrictMode>,
  );
}

registerServiceWorker();
