# Whiteboard by Dplooy

A free online whiteboard — infinite canvas, hand-drawn shapes, sticky notes, arrows that stay
attached, a pressure-sensitive pen, highlighter, laser pointer, text and images. No backend, no
accounts, nothing uploaded: boards live in the visitor's browser. Deployed as a static bundle to
[whiteboard.dplooy.com](https://whiteboard.dplooy.com).

## Pages

The build is a Vite multi-page site. Everything except `/canvas/` is plain static HTML, so search
engines read it with no JavaScript.

| URL | File | What it is |
| --- | --- | --- |
| `/` | `index.html` | Landing page (SEO) |
| `/canvas/` | `canvas/index.html` | The whiteboard app (React) |
| `/online-whiteboard-for-teaching/` | guide | Teaching |
| `/brainstorming-whiteboard/` | guide | Sticky notes, mind maps |
| `/draw-flowcharts-online/` | guide | Flowcharts |
| `/how-to-use-online-whiteboard/` | guide | Step-by-step tutorial |
| `/whiteboard-keyboard-shortcuts/` | guide | Every shortcut |

`/canvas/?template=flowchart|mindmap|kanban|lesson` opens the app with that template placed on
the board (next to anything already there, never on top of it).

### How the static pages are assembled

`build/site-plugin.ts` fills comment markers in each HTML file at dev and build time:

- `<!--site:header-->`, `<!--site:footer-->`, `<!--site:head-->` — shared chrome.
- `<!--site:jsonld-->` — one JSON-LD `@graph` (Organization, WebSite, BreadcrumbList, WebPage /
  Article, WebApplication, FAQPage, HowTo) **built from the page itself**: FAQPage from the
  `<details class="faq-item">` blocks, HowTo from `<ol class="howto" data-name="…">`. Edit the
  visible FAQ and the schema follows — never write JSON-LD by hand.
- `<!--site:shortcuts-->` / `<!--site:shortcuts-top-->` — rendered from
  `src/shared/shortcuts.ts`, the same list the in-app shortcuts dialog shows.
- `<!--site:icon:Name:size-->` — a lucide icon, identical to the app's.

The pictures on the landing and guide pages are `<canvas data-scene="…">` elements painted by
`src/site/main.ts` with the **app's own renderer and templates** — real boards, not mock-ups.

When you add a page: add it to `PAGES` (and `GUIDES` for the nav) in `build/site-plugin.ts`,
`public/sitemap.xml` and `public/llms.txt`.

## Architecture

```
src/
  engine/        framework-free whiteboard engine
    editor.ts      state, pointer/touch/keyboard input, selection, actions, autosave
    types.ts       the element model (immutable records)
    elements.ts    factories, bounds, label layout
    shape.ts       rough.js + perfect-freehand geometry, cached as Path2D
    render.ts      scene renderer (canvas, export and site previews share it)
    overlay.ts     selection frames, handles, marquee, laser and eraser trails
    hittest.ts     hit-testing in each element's rotated frame
    binding.ts     arrows attached to shapes
    transform.ts   resize / rotate / move
    properties.ts  which style settings apply to which element type
    history.ts     undo/redo over immutable snapshots
    serialize.ts   .whiteboard files, clipboard, share links (all input sanitised)
    storage.ts     IndexedDB autosave + localStorage preferences
    export.ts      PNG and SVG export (fonts embedded in SVG)
    templates.ts   starter boards, built in code
  app/           React UI for /canvas/ (toolbar, style panel, menus, dialogs)
  site/          script for the static pages (paints the preview boards)
  shared/        shortcuts list, service-worker registration
  styles/        app.css (Tailwind) and site.css (static pages)
build/           Vite plugin that assembles the static pages
public/          icons, og.png, robots.txt, sitemap.xml, llms.txt, manifest, sw.js
```

Elements are immutable: every change creates new objects, so undo history is a list of array
references and the renderer caches rough.js geometry per element until its shape changes (moving
never regenerates it).

### Data and privacy

- Autosave: IndexedDB (`whiteboard` → `boards` → `current`), ~0.5 s after each change and on tab
  hide. Preferences (theme, background, per-tool styles) in localStorage.
- Share links: the board (without images) is deflate-compressed into the URL fragment after `#`,
  which browsers never send to a server. Links over 60,000 characters are refused with a message.
- Files: `.whiteboard` is JSON (`type: "dplooy-whiteboard"`, `version: 1`) with images as data
  URLs. Everything read from a file, link or the clipboard is rebuilt field by field by
  `restoreElements` — unknown or malformed values never reach the scene.
- Offline: `public/sw.js` precaches the pages plus the scripts, styles and Latin fonts they
  reference. Bump `VERSION` in it to drop old caches.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 — landing at /, app at /canvas/
npm run typecheck  # tsc -b
npm run build      # typecheck + static build to dist/
npm run preview    # serve dist/
npm run icons      # regenerate favicons, app icons and og.png (run on Windows: uses Segoe fonts)
```

`dist/` is a plain static folder with one `index.html` per URL, deployable to any static host.

## Licences

rough.js (MIT), perfect-freehand (MIT), lucide (ISC), Geist and Kalam and JetBrains Mono fonts (OFL).
