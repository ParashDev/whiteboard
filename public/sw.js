/*
 * Offline support. Pages are network-first (a deploy is visible on the next
 * load) with the cached copy as the offline fallback; hashed build assets are
 * cache-first because their names change whenever their content does.
 * Bump VERSION to drop every cached file.
 */
const VERSION = "whiteboard-v2";
const SHELL = ["/", "/canvas/", "/manifest.webmanifest", "/favicon.svg"];

const ASSET_RE = /(?:src|href)="(\/assets\/[^"]+)"|url\((\/assets\/[^)]+)\)/g;

/** Hashed files a document or stylesheet references (Latin font subsets only). */
async function referencedAssets(cache, urls) {
  const found = new Set();
  for (const url of urls) {
    const res = await cache.match(url);
    if (!res) continue;
    const text = await res.text();
    for (const m of text.matchAll(ASSET_RE)) {
      const asset = m[1] || m[2];
      if (/\.woff2?$/.test(asset) && !/-latin-(?!ext)/.test(asset)) continue;
      found.add(asset);
    }
  }
  return [...found];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // "reload" skips the HTTP cache, so a fresh install never stores a page from the previous deploy.
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })));
      // Precache the app's scripts, styles and fonts so the first visit is enough to work offline.
      const firstLevel = await referencedAssets(cache, ["/", "/canvas/"]);
      await Promise.all(firstLevel.map((u) => cache.add(u).catch(() => undefined)));
      const fromCss = await referencedAssets(cache, firstLevel.filter((u) => u.endsWith(".css")));
      await Promise.all(fromCss.map((u) => cache.add(u).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (request.mode === "navigate") {
    // Revalidate the page with the server instead of trusting the browser's HTTP cache:
    // a page cached from the previous deploy points at build files that no longer exist.
    // (A navigate-mode Request can't take options, so it is rebuilt from its URL.)
    const fresh = new Request(request.url, { cache: "no-cache", credentials: "same-origin", redirect: "manual" });
    event.respondWith(
      fetch(fresh)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((hit) => hit || caches.match(url.pathname.startsWith("/canvas") ? "/canvas/" : "/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith("/assets/")) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
