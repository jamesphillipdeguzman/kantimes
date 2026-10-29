// ==========================================================================
// KanTimes PWA Service Worker (v2.8.0 — Dynamic Cache Invalidation & Network-First Core)
// ==========================================================================

const APP_VERSION = "2.8.0";
const CACHE_NAME = `kantimes-cache-v${APP_VERSION}`;

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./script.js",
  "./manifest.json",
  "./version.json",
  "./songs.json",
  "./data/ph-stakes.json",
  "./lame.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
  // Images & Avatars
  "./images/favicon.ico",
  "./images/kantimes-logo.png",
  "./images/kantime-logo.png",
  "./images/icon-192.png",
  "./images/icon-512.png",
  "./images/icon-maskable-192.png",
  "./images/icon-maskable-512.png",
  "./images/kantimes-bg.png",
  "./images/kantime-bg.png",
  "./images/iloilo-stake-choir-logo.jpg",
  "./images/boy-choir.jpg",
  "./images/girl-choir.jpg",
  "./images/ym-choir.jpg",
  "./images/yw-choir.jpg",
  "./images/eq-choir.jpg",
  "./images/rs-choir.jpg",
  "./images/elder-choir.jpg",
  "./images/sister-choir.jpg",
  // Local Repertoire Resources (kantimes-resources)
  "./kantimes-resources/kantimes-og-image.jpg",
  // Christmas Devotional 2026 Resources
  "./kantimes-resources/Christmas%20Devotional%202026/go_tell_it_on_the_mountain.pdf",
  "./kantimes-resources/Christmas%20Devotional%202026/Away_in_a_Manger.pdf",
  "./kantimes-resources/Christmas%20Devotional%202026/Away_in_a_Manger__Organ_.mp3",
  "./kantimes-resources/Christmas%20Devotional%202026/Light_of_the_World_Hymn_Medley.pdf",
  "./kantimes-resources/Christmas%20Devotional%202026/Light_of_the_World_medley_piano_only.mp3",
  "./kantimes-resources/Christmas%20Devotional%202026/A%20Manger%20Filled%20with%20Love%2010-23-22.pdf",
  "./kantimes-resources/Christmas%20Devotional%202026/A%20Manger%20Filled%20with%20Love.mp4",
  "./kantimes-resources/Christmas%20Devotional%202026/And%20There%20Was%20Light.pdf",
  // Choose You This Day (Archived Rehearsal Resources)
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day.mp3",
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20(piano).mp3",
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20SOPRANO.mp3",
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20ALTO.mp3",
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20TENOR.mp3",
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20BASS.mp3",
  "./kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day.pdf"
];

// --------------------------------------------------------------------------
// INSTALL — Pre-cache all static assets with network reload & take over immediately
// --------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => {
          // Force network reload to ensure fresh files are written into cache, bypassing disk cache
          const req = new Request(url, { cache: "reload" });
          return fetch(req)
            .then((response) => {
              if (response && (response.ok || response.type === "opaque")) {
                return cache.put(url, response);
              }
            })
            .catch((err) => {
              console.warn("[SW] Failed to precache:", url, err);
            });
        })
      );
    })
  );
});

// --------------------------------------------------------------------------
// ACTIVATE — Delete all stale caches & claim all clients immediately
// --------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => (name.startsWith("kantime-") || name.startsWith("kantimes-")) && name !== CACHE_NAME)
            .map((name) => {
              console.log("[SW] Deleting stale cache:", name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// --------------------------------------------------------------------------
// MESSAGE — Handle SKIP_WAITING and dynamic cache clear requests from page
// --------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_ALL_CACHES") {
    caches.keys().then((names) => {
      return Promise.all(names.map((n) => caches.delete(n)));
    });
  }
});

// --------------------------------------------------------------------------
// Helper: Handle HTTP Range requests for cached audio/video (Safari & Chrome)
// --------------------------------------------------------------------------
async function handleRangeRequest(request, cachedResponse) {
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return cachedResponse;
  try {
    const arrayBuffer = await cachedResponse.arrayBuffer();
    const bytes = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(bytes[0], 10) || 0;
    const end = bytes[1] ? parseInt(bytes[1], 10) : arrayBuffer.byteLength - 1;
    const slicedBuffer = arrayBuffer.slice(start, end + 1);

    const headers = new Headers(cachedResponse.headers);
    headers.set("Content-Range", `bytes ${start}-${end}/${arrayBuffer.byteLength}`);
    headers.set("Content-Length", slicedBuffer.byteLength);
    headers.set("Accept-Ranges", "bytes");

    return new Response(slicedBuffer, {
      status: 206,
      statusText: "Partial Content",
      headers: headers
    });
  } catch (e) {
    return cachedResponse;
  }
}

// --------------------------------------------------------------------------
// FETCH — Tiered caching strategy
//   • Google Apps Script API calls       → Always bypass (no caching)
//   • Version Check (/version.json)      → Always Network-Only (no-store)
//   • HTML navigation requests           → Network-First (fallback to cached index.html)
//   • Critical app code (JS/CSS/manifest)→ Network-First (fallback to cache)
//   • Large media & external libs        → Cache-First (instant offline playback)
// --------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Bypass service worker caching for Google Sheets, Drive media, and YouTube APIs
  if (
    url.origin.includes('docs.google.com') ||
    url.origin.includes('googleusercontent.com') ||
    url.origin.includes('youtube.com') ||
    url.origin.includes('youtu.be')
  ) {
    return; // Pass through to normal network fetch
  }

  // 1️⃣ Never intercept Google Apps Script / external API calls
  if (url.hostname.includes("script.google.com")) return;

  // 2️⃣ Version Check: Always fetch fresh from network for instant update detection
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .catch(() => caches.match("./version.json"))
    );
    return;
  }

  // 3️⃣ Network-First strategy for HTML navigation requests (app launches & shortcut taps)
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === "basic" || networkResponse.type === "default")) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: serve cached index.html
          return caches.match("./index.html");
        })
    );
    return;
  }

  // 4️⃣ Network-First strategy for core application logic & styles (script.js, style.css, manifest.json)
  const isCoreAsset =
    url.pathname.endsWith("/script.js") ||
    url.pathname.endsWith("/css/style.css") ||
    url.pathname.endsWith("/manifest.json");

  if (isCoreAsset) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
              // Also update canonical relative path in cache
              const relativePath = url.pathname.endsWith("script.js")
                ? "./script.js"
                : url.pathname.endsWith("style.css")
                  ? "./css/style.css"
                  : "./manifest.json";
              cache.put(relativePath, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: return cached copy with or without query strings
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            const relativePath = url.pathname.endsWith("script.js")
              ? "./script.js"
              : url.pathname.endsWith("style.css")
                ? "./css/style.css"
                : "./manifest.json";
            return caches.match(relativePath);
          });
        })
    );
    return;
  }

  // 5️⃣ Cache-First strategy for heavy media & static libs (audio tracks, PDFs, images, lame.min.js)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        if (request.headers.get("range")) {
          return handleRangeRequest(request, cachedResponse.clone());
        }
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === "basic" || networkResponse.type === "cors" || networkResponse.type === "opaque")
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // Silent failure for non-critical offline assets
        });
    })
  );
});
