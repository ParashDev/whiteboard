/**
 * Generates the raster brand assets into public/:
 *   icon-192.png, icon-512.png (maskable), apple-touch-icon.png (180),
 *   favicon.ico (32 + 16) and og.png (1200×630).
 * The og.png shapes are drawn by rough.js — the same generator the app uses —
 * so the social card shows the real hand-drawn style.
 * Run: npm run icons   (fonts: Segoe UI / Segoe Print, i.e. run it on Windows)
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import rough from "roughjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TEAL = "#0d9488";
const OUT = resolve(process.cwd(), "public");
const gen = rough.generator();

const GLYPH =
  '<path d="M7.5 19.5c2.4-5.2 4.6-7.4 6.3-6.2 1.9 1.3.1 6 2.1 6.6 2.1.6 3.9-5.2 8.6-6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 24.5h15" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>';

function appIconSvg(size, radiusRatio = 0.22, inset = 0) {
  const r = Math.round(size * radiusRatio);
  const scale = (size * (1 - inset * 2)) / 32;
  const offset = size * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${TEAL}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${GLYPH}</g>
</svg>`;
}

function roughSvg(drawable) {
  return gen
    .toPaths(drawable)
    .map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? "none"}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join("");
}

const base = { roughness: 1, bowing: 1, strokeWidth: 2.2, stroke: "#1e1e1e", preserveVertices: true };

function label(x, y, text, size = 30) {
  return `<text x="${x}" y="${y}" font-family="Segoe Print, Comic Sans MS, cursive" font-size="${size}" fill="#1e1e1e" text-anchor="middle" dominant-baseline="central">${text}</text>`;
}

function sticky(x, y, w, h, color, angle, text) {
  return `<g transform="rotate(${angle} ${x + w / 2} ${y + h / 2})">
    <rect x="${x + 3}" y="${y + 8}" width="${w}" height="${h}" rx="3" fill="#0f172a" fill-opacity="0.10"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${color}"/>
    ${text.map((t, i) => label(x + w / 2, y + h / 2 + (i - (text.length - 1) / 2) * 34, t, 25)).join("")}
  </g>`;
}

function ogSvg() {
  let dots = "";
  for (let x = 612; x < 1200; x += 26) for (let y = 14; y < 630; y += 26) dots += `M${x} ${y}h1.6v1.6h-1.6z`;
  const rect = roughSvg(gen.rectangle(652, 150, 190, 92, { ...base, seed: 7, fill: "#a5d8ff", fillStyle: "hachure", hachureGap: 9, fillWeight: 1.4 }));
  const diamond = roughSvg(gen.polygon([[1010, 112], [1120, 196], [1010, 280], [900, 196]], { ...base, seed: 11, fill: "#ffec99", fillStyle: "solid" }));
  const ellipse = roughSvg(gen.ellipse(1010, 432, 210, 100, { ...base, seed: 5, fill: "#b2f2bb", fillStyle: "solid" }));
  const arrow1 = roughSvg(gen.linearPath([[850, 196], [892, 196]], { ...base, seed: 3 })) + roughSvg(gen.linearPath([[880, 186], [893, 196], [880, 206]], { ...base, seed: 4 }));
  const arrow2 = roughSvg(gen.linearPath([[1010, 290], [1010, 372]], { ...base, seed: 9 })) + roughSvg(gen.linearPath([[1000, 360], [1010, 373], [1020, 360]], { ...base, seed: 10 }));
  const marker = roughSvg(gen.linearPath([[86, 352], [230, 346], [446, 350]], { roughness: 0.8, stroke: "#14b8a6", strokeWidth: 10, seed: 2 }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <path d="${dots}" fill="#d3d7dd"/>
  <g transform="translate(84 92)"><rect width="60" height="60" rx="15" fill="${TEAL}"/><g transform="scale(1.875)">${GLYPH}</g></g>
  <text x="162" y="131" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600" fill="#141417">Whiteboard <tspan fill="#8a8a95" font-weight="400">by Dplooy</tspan></text>
  <g opacity="0.75">${marker}</g>
  <text x="84" y="262" font-family="Segoe UI, Arial, sans-serif" font-size="74" font-weight="700" fill="#141417" letter-spacing="-2">Free online</text>
  <text x="84" y="340" font-family="Segoe UI, Arial, sans-serif" font-size="74" font-weight="700" fill="#141417" letter-spacing="-2">whiteboard</text>
  <text x="86" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="29" fill="#4b4b55">Draw, type and sketch on an infinite canvas.</text>
  <text x="86" y="464" font-family="Segoe UI, Arial, sans-serif" font-size="29" fill="#4b4b55">No sign-up. Nothing uploaded.</text>
  <text x="86" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#8a8a95">whiteboard.dplooy.com</text>
  ${rect}${label(747, 196, "Idea")}
  ${arrow1}
  ${diamond}${label(1010, 196, "Ready?")}
  ${arrow2}<text x="1034" y="334" font-family="Segoe Print, cursive" font-size="22" fill="#1e1e1e">yes</text>
  ${ellipse}${label(1010, 432, "Ship it")}
  ${sticky(682, 296, 180, 136, "#fff3a3", -4, ["Invite beta", "users"])}
  ${sticky(716, 468, 176, 116, "#ffd6e0", 3, ["Launch post"])}
</svg>`;
}

async function render(svg, size, path) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(OUT, path));
  console.log("wrote", path);
}

await render(appIconSvg(512, 0.22), 512, "icon-512.png");
await render(appIconSvg(512, 0.22), 192, "icon-192.png");
await render(appIconSvg(512, 0, 0.1), 512, "icon-maskable-512.png");
await render(appIconSvg(512, 0.19), 180, "apple-touch-icon.png");

const png32 = await sharp(Buffer.from(appIconSvg(512))).resize(32, 32).png().toBuffer();
const png16 = await sharp(Buffer.from(appIconSvg(512))).resize(16, 16).png().toBuffer();
await writeFile(resolve(OUT, "favicon.ico"), await pngToIco([png32, png16]));
console.log("wrote favicon.ico");

await sharp(Buffer.from(ogSvg())).png().toFile(resolve(OUT, "og.png"));
console.log("wrote og.png");
