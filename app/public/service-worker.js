const CACHE_VERSION = 'v1';
const CORE_CACHE = `fintrackr-core-${CACHE_VERSION}`;
const RUNTIME_CACHE = `fintrackr-runtime-${CACHE_VERSION}`;
const API_CACHE = `fintrackr-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `fintrackr-images-${CACHE_VERSION}`;
const FONT_CACHE = `fintrackr-fonts-${CACHE_VERSION}`;
const OFFLINE_QUEUE_DB = 'fintrackr-pwa';
const OFFLINE_QUEUE_STORE = 'request-queue';
const SYNC_TAG = 'fintrackr-expense-sync';

const CORE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/browserconfig.xml',
  '/favicon.ico',
  '/assets/app_logo.png',
  '/assets/name_logo.svg',
  '/assets/app_logo.png',
  '/assets/app_logo.png',
  '/assets/app_logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    const requests = CORE_ASSETS.map((assetUrl) => new Request(assetUrl, { cache: 'reload' }));
    await Promise.allSettled(
      requests.map(async (request) => {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response);
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const allowedCaches = new Set([CORE_CACHE, RUNTIME_CACHE, API_CACHE, IMAGE_CACHE, FONT_CACHE]);
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => !allowedCaches.has(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'SYNC_OFFLINE_EXPENSES') {
    event.waitUntil(syncQueuedRequests());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleDocumentRequest(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'worker') {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (request.destination === 'font') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncQueuedRequests());
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'FinTrackr update',
    body: 'Your finance data has an update waiting.',
    url: '/dashboard'
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/assets/app_logo.png',
      badge: '/assets/app_logo.png',
      data: { url: payload.url || '/dashboard' },
      tag: payload.tag || 'fintrackr-notification',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('focus' in client) {
        client.navigate(targetUrl);
        await client.focus();
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

async function handleDocumentRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match('/offline.html');
  }
}

async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }

    return new Response(JSON.stringify({ detail: 'Offline and no cached response is available.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  if (request.mode === 'navigate') {
    return caches.match('/offline.html');
  }

  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

function openQueueDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        const store = database.createObjectStore(OFFLINE_QUEUE_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('queuedAt', 'queuedAt');
      }
    };
  });
}

async function getQueuedRequests() {
  const database = await openQueueDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function deleteQueuedRequest(id) {
  const database = await openQueueDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function syncQueuedRequests() {
  const queuedRequests = await getQueuedRequests();

  for (const item of queuedRequests.sort((left, right) => left.queuedAt - right.queuedAt)) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
        credentials: 'include',
      });

      if (response.ok) {
        await deleteQueuedRequest(item.id);
        await notifyClients({
          type: 'FINTRACKR_OFFLINE_REQUEST_SYNCED',
          payload: { requestId: item.id, url: item.url },
        });
        continue;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await deleteQueuedRequest(item.id);
        await notifyClients({
          type: 'FINTRACKR_OFFLINE_REQUEST_FAILED',
          payload: { requestId: item.id, url: item.url, status: response.status },
        });
        continue;
      }

      throw new Error(`Request failed with status ${response.status}`);
    } catch (error) {
      await notifyClients({
        type: 'FINTRACKR_OFFLINE_SYNC_RETRYING',
        payload: { requestId: item.id, url: item.url, message: error.message },
      });
      throw error;
    }
  }

  if (self.registration?.showNotification && Notification.permission === 'granted') {
    await self.registration.showNotification('FinTrackr synced offline changes', {
      body: 'Queued expense updates are now stored on the server.',
      icon: '/assets/app_logo.png',
      badge: '/assets/app_logo.png',
      tag: 'fintrackr-sync-success',
    });
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(clients.map((client) => client.postMessage(message)));
}