// Build-time templating for the static pages. Each page is plain HTML (so it
// is fully crawlable with no JavaScript) and pulls shared pieces in through
// comment markers:
//
//   <!--site:page {"crumb": "...", "kind": "guide"}-->  page settings (removed)
//   <!--site:head-->       icons, manifest, theme colour
//   <!--site:header-->     site header with the current page marked
//   <!--site:footer-->     site footer
//   <!--site:jsonld-->     structured data built FROM the page: its title and
//                          description, FAQ <details>, and HowTo <ol> — so the
//                          schema can never drift from what the page shows
//   <!--site:shortcuts-->  the full shortcut tables (src/shared/shortcuts.ts)
//   <!--site:shortcuts-top--> a short table of the most-used keys
//   <!--site:icon:Name-->  a lucide icon, identical to the app's

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowRight,
  Check,
  Circle,
  Diamond,
  Download,
  Eraser,
  FileDown,
  Hand,
  Highlighter,
  ImagePlus,
  Link2,
  LockOpen,
  Menu,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Plus,
  Redo2,
  ShieldCheck,
  Square,
  StickyNote,
  Type,
  Undo2,
  WandSparkles,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Plugin } from "vite";
import { SHORTCUT_GROUPS } from "../src/shared/shortcuts";

export const ORIGIN = "https://whiteboard.dplooy.com";
export const SITE_NAME = "Whiteboard by Dplooy";
export const UPDATED = "2026-09-29";

export const PAGES = [
  { name: "main", file: "index.html", path: "/" },
  { name: "canvas", file: "canvas/index.html", path: "/canvas/" },
  { name: "teaching", file: "online-whiteboard-for-teaching/index.html", path: "/online-whiteboard-for-teaching/" },
  { name: "brainstorming", file: "brainstorming-whiteboard/index.html", path: "/brainstorming-whiteboard/" },
  { name: "flowcharts", file: "draw-flowcharts-online/index.html", path: "/draw-flowcharts-online/" },
  { name: "howto", file: "how-to-use-online-whiteboard/index.html", path: "/how-to-use-online-whiteboard/" },
  { name: "shortcuts", file: "whiteboard-keyboard-shortcuts/index.html", path: "/whiteboard-keyboard-shortcuts/" },
] as const;

export const GUIDES = [
  { path: "/online-whiteboard-for-teaching/", label: "Whiteboard for teaching", short: "Teaching" },
  { path: "/brainstorming-whiteboard/", label: "Brainstorming whiteboard", short: "Brainstorming" },
  { path: "/draw-flowcharts-online/", label: "Draw flowcharts online", short: "Flowcharts" },
  { path: "/how-to-use-online-whiteboard/", label: "How to use the whiteboard", short: "How to use" },
  { path: "/whiteboard-keyboard-shortcuts/", label: "Keyboard shortcuts", short: "Shortcuts" },
];

const ICONS: Record<string, LucideIcon> = {
  ArrowRight,
  Check,
  Circle,
  Diamond,
  Download,
  Eraser,
  FileDown,
  Hand,
  Highlighter,
  ImagePlus,
  Link2,
  LockOpen,
  Menu,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Plus,
  Redo2,
  ShieldCheck,
  Square,
  StickyNote,
  Type,
  Undo2,
  WandSparkles,
  WifiOff,
  X,
};

export function icon(name: string, size = 18, strokeWidth = 1.75): string {
  const I = ICONS[name];
  if (!I) throw new Error(`site-plugin: unknown icon "${name}" — add it to ICONS`);
  return renderToStaticMarkup(createElement(I, { size, strokeWidth, "aria-hidden": true }));
}

export const LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0d9488"/><path d="M7.5 19.5c2.4-5.2 4.6-7.4 6.3-6.2 1.9 1.3.1 6 2.1 6.6 2.1.6 3.9-5.2 8.6-6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 24.5h15" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></svg>`;

interface PageConfig {
  crumb?: string;
  kind?: "landing" | "guide" | "app";
  published?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", hellip: "…" };

function plain(html: string): string {
  return html
    .replace(/<kbd>([\s\S]*?)<\/kbd>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+|#\d+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function head(): string {
  return [
    `<link rel="icon" href="/favicon.ico" sizes="32x32" />`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<meta name="author" content="Dplooy" />`,
    `<meta name="application-name" content="${SITE_NAME}" />`,
  ].join("\n    ");
}

function header(path: string): string {
  const links = GUIDES.map(
    (g) => `<a href="${g.path}"${g.path === path ? ' aria-current="page"' : ""}>${g.short}</a>`,
  ).join("");
  return `<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${SITE_NAME} — home">${LOGO_SVG}<span class="brand-name">Whiteboard</span><span class="brand-by">by Dplooy</span></a>
    <nav class="nav" aria-label="Guides">${links}</nav>
    <a class="btn btn-primary btn-sm header-cta" href="/canvas/">Open whiteboard</a>
    <details class="menu">
      <summary aria-label="Open menu"><span class="menu-open">${icon("Menu", 20)}</span><span class="menu-close">${icon("X", 20)}</span></summary>
      <nav class="menu-panel" aria-label="Guides">${links}<a class="btn btn-primary" href="/canvas/">Open the whiteboard</a></nav>
    </details>
  </div>
</header>`;
}

function footer(): string {
  const guideLinks = GUIDES.map((g) => `<li><a href="${g.path}">${g.label}</a></li>`).join("");
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/">${LOGO_SVG}<span class="brand-name">Whiteboard</span><span class="brand-by">by Dplooy</span></a>
      <p>A free online whiteboard. No sign-up, nothing uploaded, works on any device.</p>
    </div>
    <nav aria-label="Guides"><p class="footer-h">Guides</p><ul>${guideLinks}</ul></nav>
    <nav aria-label="Whiteboard"><p class="footer-h">Whiteboard</p><ul>
      <li><a href="/canvas/">Open the canvas</a></li>
      <li><a href="/canvas/?template=flowchart">Flowchart template</a></li>
      <li><a href="/canvas/?template=mindmap">Mind map template</a></li>
      <li><a href="/canvas/?template=kanban">Kanban board template</a></li>
      <li><a href="/canvas/?template=lesson">Math lesson template</a></li>
    </ul></nav>
    <nav aria-label="More from Dplooy"><p class="footer-h">From Dplooy</p><ul>
      <li><a href="https://www.dplooy.com">Free website hosting</a></li>
      <li><a href="https://bpmnstudio.dplooy.com">BPMN Studio</a></li>
      <li><a href="https://playground.dplooy.com">Code Playground</a></li>
      <li><a href="https://flipbook.dplooy.com">PDF Flipbook Reader</a></li>
      <li><a href="https://www.dplooy.com/utility">More free tools</a></li>
    </ul></nav>
  </div>
  <div class="wrap footer-base"><span>© 2026 Dplooy</span><span>Built and hosted on <a href="https://www.dplooy.com">Dplooy</a></span></div>
</footer>`;
}

function comboHtml(combo: string[]): string {
  return `<span class="combo">${combo.map((k) => `<kbd>${esc(k)}</kbd>`).join('<span class="plus">+</span>')}</span>`;
}

function shortcutRows(items: { label: string; keys: string[][] }[]): string {
  return items
    .map((it) => `<tr><td>${esc(it.label)}</td><td>${it.keys.map(comboHtml).join('<span class="or">or</span>')}</td></tr>`)
    .join("");
}

function shortcutsFull(): string {
  return SHORTCUT_GROUPS.map(
    (g) => `<section class="kb-group" id="${g.id}">
  <h2>${esc(g.title)} shortcuts</h2>
  <table class="spec kb"><thead><tr><th scope="col">Action</th><th scope="col">Keys</th></tr></thead><tbody>${shortcutRows(g.items)}</tbody></table>
</section>`,
  ).join("\n");
}

function shortcutsTop(): string {
  const pick = (group: string, labels: string[]) =>
    SHORTCUT_GROUPS.find((g) => g.id === group)?.items.filter((i) => labels.includes(i.label)) ?? [];
  const items = [
    ...pick("tools", ["Select", "Rectangle", "Sticky note", "Arrow", "Pen", "Text"]),
    ...pick("editing", ["Undo", "Duplicate", "Group"]),
    ...pick("view", ["Zoom to fit the whole board", "Pan the canvas"]),
    ...pick("file", ["Export as PNG or SVG"]),
  ];
  return `<table class="spec kb"><thead><tr><th scope="col">Action</th><th scope="col">Keys</th></tr></thead><tbody>${shortcutRows(items)}</tbody></table>`;
}

function jsonLd(html: string, path: string, cfg: PageConfig): string {
  const url = ORIGIN + path;
  const title = plain(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? SITE_NAME);
  const description = plain(/<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? "");
  // "Main line: second line" — the h1's two lines joined the way a headline reads.
  const [h1Main, h1Sub] = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? title).split('<span class="line2">');
  const h1 = h1Sub ? `${plain(h1Main)}: ${plain(h1Sub)}` : plain(h1Main);
  const graph: Record<string, unknown>[] = [];

  graph.push({
    "@type": "Organization",
    "@id": "https://www.dplooy.com/#organization",
    name: "Dplooy",
    url: "https://www.dplooy.com",
  });
  graph.push({
    "@type": "WebSite",
    "@id": `${ORIGIN}/#website`,
    name: SITE_NAME,
    url: `${ORIGIN}/`,
    inLanguage: "en",
    publisher: { "@id": "https://www.dplooy.com/#organization" },
  });

  const crumbs = [{ name: "Online whiteboard", item: `${ORIGIN}/` }];
  if (path !== "/") crumbs.push({ name: cfg.crumb ?? h1, item: url });
  graph.push({
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
  });

  graph.push({
    "@type": cfg.kind === "guide" ? ["WebPage", "Article"] : "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    headline: h1,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${ORIGIN}/#website` },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    primaryImageOfPage: `${ORIGIN}/og.png`,
    image: `${ORIGIN}/og.png`,
    datePublished: cfg.published ?? UPDATED,
    dateModified: UPDATED,
    author: { "@id": "https://www.dplooy.com/#organization" },
    publisher: { "@id": "https://www.dplooy.com/#organization" },
    ...(cfg.kind !== "guide" ? { mainEntity: { "@id": `${ORIGIN}/#app` } } : { about: { "@id": `${ORIGIN}/#app` } }),
  });

  graph.push({
    "@type": "WebApplication",
    "@id": `${ORIGIN}/#app`,
    name: SITE_NAME,
    alternateName: ["Free Online Whiteboard", "Dplooy Whiteboard"],
    url: `${ORIGIN}/canvas/`,
    applicationCategory: "DesignApplication",
    applicationSubCategory: "Online whiteboard",
    operatingSystem: "Any — runs in the web browser",
    browserRequirements: "Requires a modern browser with JavaScript enabled",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    screenshot: `${ORIGIN}/og.png`,
    featureList: [
      "Infinite canvas with zoom and pan",
      "Hand-drawn shapes: rectangle, diamond, ellipse, triangle",
      "Sticky notes",
      "Arrows that stay attached to shapes",
      "Pen with pressure support, highlighter and laser pointer",
      "Text in hand-drawn, normal and code fonts",
      "Images by upload, paste or drag and drop",
      "Undo and redo, grouping, alignment and layers",
      "Export to PNG and SVG, copy image to clipboard",
      "Share a copy with a link",
      "Autosave in the browser, save and open .whiteboard files",
      "Dark mode, dot and grid backgrounds",
      "Works offline after the first visit",
      "No sign-up and no upload",
    ],
    creator: { "@id": "https://www.dplooy.com/#organization" },
  });

  const faq = [...html.matchAll(/<details class="faq-item"[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<div class="faq-a">([\s\S]*?)<\/div>\s*<\/details>/g)];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faq.map((m) => ({
        "@type": "Question",
        name: plain(m[1]),
        acceptedAnswer: { "@type": "Answer", text: plain(m[2]) },
      })),
    });
  }

  const howto = /<ol class="howto" data-name="([^"]+)"[^>]*>([\s\S]*?)<\/ol>/.exec(html);
  if (howto) {
    const steps = [...howto[2].matchAll(/<li[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/li>/g)];
    graph.push({
      "@type": "HowTo",
      "@id": `${url}#howto`,
      name: plain(howto[1]),
      tool: { "@type": "HowToTool", name: SITE_NAME },
      totalTime: "PT5M",
      estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
      step: steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: plain(s[1]),
        text: plain(s[2]),
        url: `${url}#step-${i + 1}`,
      })),
    });
  }

  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

export function sitePlugin(): Plugin {
  return {
    name: "whiteboard-site",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const cfgMatch = /<!--site:page (\{[\s\S]*?\})-->\s*/.exec(html);
        const cfg: PageConfig = cfgMatch ? (JSON.parse(cfgMatch[1]) as PageConfig) : {};
        let path = ctx.path.replace(/index\.html$/, "");
        if (!path.endsWith("/")) path += "/";
        // HowTo steps get anchors so the schema's step URLs resolve.
        let stepIndex = 0;
        let out = html
          .replace(cfgMatch?.[0] ?? "\u0000", "")
          .replace(/<ol class="howto"([^>]*)>([\s\S]*?)<\/ol>/, (_m, attrs: string, body: string) => {
            const numbered = body.replace(/<li(?![^>]*\bid=)([^>]*)>/g, (_l, a: string) => `<li id="step-${++stepIndex}"${a}>`);
            return `<ol class="howto"${attrs}>${numbered}</ol>`;
          });
        out = out
          .replace("<!--site:head-->", head())
          .replace("<!--site:header-->", header(path))
          .replace("<!--site:footer-->", footer())
          .replace("<!--site:shortcuts-->", shortcutsFull())
          .replace("<!--site:shortcuts-top-->", shortcutsTop())
          .replace(/<!--site:icon:([A-Za-z0-9]+)(?::(\d+))?-->/g, (_m, name: string, size?: string) => icon(name, size ? Number(size) : 18));
        return out.replace("<!--site:jsonld-->", jsonLd(out, path, cfg));
      },
    },
  };
}
