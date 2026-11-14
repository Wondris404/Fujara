const CACHE = "fujara-shell-v1";
const SHELL = ["/", "/playlists", "/downloads", "/settings", "/manifest.webmanifest", "/offline.html", "/icons/icon.svg"];

function sameOriginStatic(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/") && !url.pathname.includes("..");
}

async function putUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload", credentials: "same-origin" });
    if (!response || !response.ok || response.type !== "basic") return;
    await cache.put(url, response);
  } catch {
    // One missing or oversized file must not fail the rest of the shell.
  }
}

async function putMany(urls) {
  const cache = await caches.open(CACHE);
  const pending = urls.slice();
  const workers = Array.from({ length: 6 }, async () => {
    while (pending.length > 0) {
      const url = pending.pop();
      if (typeof url === "string") await putUrl(cache, url);
    }
  });
  await Promise.all(workers);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await putMany(SHELL);
      try {
        const response = await fetch("/api/shell-assets", { cache: "no-store", credentials: "same-origin" });
        if (response.ok) {
          const body = await response.json();
          const assets = Array.isArray(body.assets)
            ? body.assets.filter((item) => typeof item === "string" && item.startsWith("/_next/static/") && !item.includes(".."))
            : [];
          await putMany(assets);
        }
      } catch {
        // Documents and chunks visited while online are still stored by the fetch handler.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("fujara-shell-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheKey(url) {
  return url.pathname + url.search;
}

async function fromCache(request, url) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request)) || (await cache.match(cacheKey(url))) || (await cache.match(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.includes("callback")) return;

  const navigation = event.request.mode === "navigate";
  const staticAsset = sameOriginStatic(url);
  const shellFile = SHELL.includes(url.pathname);
  if (!navigation && !staticAsset && !shellFile) return;

  if (event.request.headers.has("RSC") || event.request.headers.has("Next-Router-Prefetch")) return;

  event.respondWith(
    (async () => {
      if (staticAsset) {
        const cached = await fromCache(event.request, url);
        if (cached) return cached;
      }
      try {
        const response = await fetch(event.request);
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          const cache = await caches.open(CACHE);
          await cache.put(cacheKey(url), copy);
        }
        return response;
      } catch {
        const cached = await fromCache(event.request, url);
        if (cached) return cached;
        if (navigation) {
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
        }
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })(),
  );
});
