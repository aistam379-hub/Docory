// =====================================================
// DocBook Service Worker — PWA Offline Support
// =====================================================

const CACHE_NAME = 'docbook-v1.0.0';
const STATIC_CACHE = 'docbook-static-v1';

// الملفات التي يتم تخزينها مسبقاً للعمل بدون إنترنت
const PRECACHE_URLS = [
  '/Docory/',
  '/Docory/index.html',
  '/Docory/manifest.json',
  '/Docory/icons/icon-192.png',
  '/Docory/icons/icon-512.png',
];

// المصادر الخارجية التي يتم تخزينها عند أول تحميل
const EXTERNAL_CACHE_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.tailwindcss.com',
  'unpkg.com',
];

// ────────────── Install Event ──────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing DocBook Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.warn('[SW] Pre-cache failed (non-fatal):', err);
        return self.skipWaiting();
      })
  );
});

// ────────────── Activate Event ──────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating DocBook Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activation complete');
      return self.clients.claim();
    })
  );
});

// ────────────── Fetch Event ──────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s)
  if (!request.url.startsWith('http')) return;

  // Strategy: Cache First for local files
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy: Stale-While-Revalidate for external CDN resources
  const isExternal = EXTERNAL_CACHE_PATTERNS.some(p => url.hostname.includes(p));
  if (isExternal) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(networkWithCacheFallback(request));
});

// ────────────── Cache Strategies ──────────────

// Cache First — للملفات المحلية
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // إذا فشل الاتصال وما في كاش، أرجع صفحة 404 بسيطة
    return new Response('<h1 dir="rtl">التطبيق يعمل بدون إنترنت — الملف غير متاح</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Stale-While-Revalidate — للـ CDN
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('', { status: 503 });
}

// Network with Cache Fallback
async function networkWithCacheFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// ────────────── Push Notifications (مستقبلي) ──────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'DocBook';
  const options = {
    body: data.body || 'لديك موعد جديد',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});

console.log('[SW] DocBook Service Worker loaded ✓');
