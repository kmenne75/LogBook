"use strict";

const CACHE = "workout-log-v1.6.0";
const OFFLINE_PAGE = "./index.html";
const ASSETS = [
  "./",
  OFFLINE_PAGE,
  "./styles.css?v=1.6.0",
  "./app.js?v=1.6.0",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

async function cacheFreshAssets() {
  const cache = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async url => {
    const request = new Request(url, { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Impossibile aggiornare ${url}`);
    await cache.put(url, response);
  }));
}

self.addEventListener("install", event => {
  event.waitUntil(cacheFreshAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || caches.match(OFFLINE_PAGE);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request, { cache: "no-store" }).then(async response => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  return cached || refresh;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
