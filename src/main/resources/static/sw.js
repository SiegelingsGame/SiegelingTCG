/*
 * Siegelings TCG service worker.
 *
 * Goals: instant repeat loads of the app shell + assets, and basic offline
 * resilience — WITHOUT the classic "stuck on an old version" footgun.
 *
 * Strategy by request type:
 *   - Non-GET, cross-origin, /api/*, or range requests  -> not intercepted
 *     (the browser handles them normally; the app's own logic stays in charge
 *     of auth/game state, which must always hit the network).
 *   - HTML navigations                                  -> network-first
 *     (so every online visit picks up the latest deploy; cache is the offline
 *     fallback only).
 *   - Images                                            -> cache-first + LRU cap.
 *   - Other static assets (JS/CSS/fonts/manifest/icons) -> stale-while-revalidate
 *     (instant from cache, refreshed in the background; self-heals if stale).
 *
 * Bump CACHE_VERSION to force a clean sweep of every cache on the next visit.
 */
const CACHE_VERSION = 'v7';
const STATIC_CACHE = `siegelings-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `siegelings-img-${CACHE_VERSION}`;
const HTML_CACHE = `siegelings-html-${CACHE_VERSION}`;
const MAX_IMAGE_ENTRIES = 120;

const CORE_ASSETS = [
    '/offline.html',
    '/site.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            // Core assets are best-effort: a single 404 must not abort install.
            .then((cache) => Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('siegelings-') && !key.endsWith(`-${CACHE_VERSION}`))
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Only GETs are cacheable. Everything else (POST/PUT/etc.) goes to network.
    if (req.method !== 'GET') return;

    // Range requests (e.g. audio seeking) don't play well with the Cache API.
    if (req.headers.has('range')) return;

    let url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return;
    }

    // Leave cross-origin (Firebase, CDNs) and all API traffic to the network so
    // auth/game state is never served stale from the SW.
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    if (req.mode === 'navigate' || req.destination === 'document') {
        event.respondWith(networkFirst(req));
        return;
    }

    if (req.destination === 'image') {
        event.respondWith(cacheFirstImage(req));
        return;
    }

    // Scripts and styles are network-first (cache only as offline fallback). The app
    // shell carries the auth logic, and an installed Web App (iOS standalone) can
    // otherwise keep running a stale, buggy bundle across relaunches even after a
    // fix ships — stale-while-revalidate serves the old file first and only updates
    // the NEXT launch. Network-first guarantees the latest code whenever online.
    if (req.destination === 'script' || req.destination === 'style') {
        event.respondWith(networkFirstAsset(req));
        return;
    }

    event.respondWith(staleWhileRevalidate(req));
});

async function networkFirstAsset(req) {
    const cache = await caches.open(STATIC_CACHE);
    try {
        const res = await fetch(req);
        if (res && res.ok) {
            cache.put(req, res.clone());
        }
        return res;
    } catch (e) {
        const cached = await cache.match(req);
        return cached || Response.error();
    }
}

async function networkFirst(req) {
    const cache = await caches.open(HTML_CACHE);
    try {
        const res = await fetch(req);
        // Never cache redirected navigations — replaying them later throws
        // "Response served by service worker has redirections" and breaks the load.
        if (res && res.ok && !res.redirected) {
            cache.put(req, res.clone());
        }
        return res;
    } catch (e) {
        const cached = await cache.match(req);
        if (cached) return cached;
        const offline = await caches.match('/offline.html');
        return offline || Response.error();
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
        .then((res) => {
            if (res && res.ok) {
                cache.put(req, res.clone());
            }
            return res;
        })
        .catch(() => null);
    return cached || (await network) || Response.error();
}

async function cacheFirstImage(req) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const res = await fetch(req);
        if (res && res.ok) {
            await cache.put(req, res.clone());
            trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES);
        }
        return res;
    } catch (e) {
        return cached || Response.error();
    }
}

async function trimCache(name, maxEntries) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    const overflow = keys.length - maxEntries;
    for (let i = 0; i < overflow; i++) {
        await cache.delete(keys[i]);
    }
}

// Allow the page to trigger an immediate activation after an update.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
