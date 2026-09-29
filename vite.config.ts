import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { PAGES, sitePlugin } from "./build/site-plugin";

// Multi-page build: the landing page and guides are static HTML (crawlable
// without JavaScript); the whiteboard app lives at /canvas/. Every page gets
// its own dist/<path>/index.html, so any static host serves clean URLs.
export default defineConfig({
  plugins: [react(), tailwindcss(), sitePlugin()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((p) => [p.name, resolve(__dirname, p.file)])),
      output: {
        // The renderer and templates the static pages share with the app, in one named chunk.
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (/node_modules\/(roughjs|perfect-freehand)\//.test(path)) return "engine";
          if (/src\/engine\/(render|shape|elements|text|math|constants|templates|binding|hittest)\.ts$/.test(path)) return "engine";
          return undefined;
        },
      },
    },
  },
});
