/* Service worker Maple: cache di base per l'uso offline.
   - Asset statici (_next/static, immagini, icone): stale-while-revalidate
   - Navigazioni: network-first con fallback alla cache (ultima versione vista)
   - API e richieste non-GET: sempre rete, mai cache */

const CACHE = "maple-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Maple", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);

  if (isStatic) {
    // stale-while-revalidate
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    // network-first con fallback offline all'ultima versione vista
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          // fallback generico: la dashboard se in cache
          const dash = await cache.match("/dashboard");
          if (dash) return dash;
          return new Response(
            "<html><body style='font-family:sans-serif;text-align:center;padding:4rem 1rem'><h2>Sei offline</h2><p>Riapri Maple quando torni in rete.</p></body></html>",
            { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 }
          );
        })
    );
  }
});
