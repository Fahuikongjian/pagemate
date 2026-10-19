// Cache only the application shell. Private files, answers and API requests never enter Cache Storage.
const CACHE = "pagemate-shell-v1";
const PRECACHE = /* PRECACHE */ [];
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.length ? PRECACHE : ["/", "/icon.svg", "/manifest.webmanifest"])),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/mcp"
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response.ok &&
          (url.pathname === "/" || url.pathname.startsWith("/assets/"))
        ) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(event.request)) ||
          (event.request.mode === "navigate"
            ? await caches.match("/")
            : Response.error()),
      ),
  );
});
