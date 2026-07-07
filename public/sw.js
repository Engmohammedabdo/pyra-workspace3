// Pyra Workspace Service Worker
// Provides offline caching for static assets and API responses.

const CACHE_NAME = 'pyra-v1';
const STATIC_CACHE = 'pyra-static-v1';

// Static assets to cache on install
const PRECACHE_URLS = [
  '/dashboard',
  '/offline',
];

// Install — cache static assets (non-blocking: skip URLs that fail)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            // Silently skip URLs that can't be cached
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

async function latestNotification() {
  try {
    const response = await fetch('/api/notifications?limit=1', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const json = await response.json();
    return Array.isArray(json.data) ? json.data[0] : null;
  } catch {
    return null;
  }
}

function resolveNotificationUrl(notification) {
  const targetPath = typeof notification?.target_path === 'string' ? notification.target_path : '';
  const type = typeof notification?.type === 'string' ? notification.type : '';

  if (targetPath === '/dashboard' || targetPath.startsWith('/dashboard/')) {
    return targetPath;
  }

  if (targetPath && (type === 'mention' || type === 'client_comment' || type === 'comment_added')) {
    return `/dashboard/projects/${encodeURIComponent(targetPath)}`;
  }

  if (type === 'file_uploaded' || type === 'file_shared') return '/dashboard/files';
  if (type === 'review_added' || type === 'approval_requested') return '/dashboard/reviews';
  if (type === 'team_added') return '/dashboard/teams';
  if (type === 'permission_changed') return '/dashboard/permissions';

  return '/dashboard/notifications';
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const notification = await latestNotification();
    const title = notification?.title || 'Pyra Workspace';
    const body = notification?.message || 'لديك إشعار جديد';
    const url = resolveNotificationUrl(notification);

    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag: notification?.id || 'pyra-notification',
      data: { url },
      dir: 'rtl',
      lang: 'ar',
      requireInteraction: false,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = resolveNotificationUrl({ target_path: event.notification.data?.url });
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const targetUrl = new URL(url, self.location.origin).href;
    for (const client of allClients) {
      if ('focus' in client && client.url.startsWith(self.location.origin)) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls (don't cache them)
  if (url.pathname.startsWith('/api/')) return;

  // Skip Supabase requests
  if (url.hostname.includes('supabase') || url.hostname.includes('pyramedia.cloud')) return;

  // For navigation requests — network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a clone of the response
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Explicit STATIC_CACHE lookup — /offline is precached there
            // (see PRECACHE_URLS + install handler). The unqualified
            // caches.match() above can resolve from either CACHE_NAME or
            // STATIC_CACHE in implementation-defined order, which could
            // serve a stale empty entry from CACHE_NAME before reaching
            // the precached /offline page. Phase 10 Commit 3.
            return caches.open(STATIC_CACHE).then((cache) =>
              cache.match('/offline'),
            );
          });
        })
    );
    return;
  }

  // For static assets — cache first, then network
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
          return response;
        });
      })
    );
    return;
  }
});
