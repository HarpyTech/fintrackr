import { queueOfflineRequest } from '../pwa/offlineQueue';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getCookieValue(name) {
  if (typeof document === 'undefined') {
    return null;
  }

  const pairs = document.cookie ? document.cookie.split('; ') : [];
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

function buildUrl(path) {
  if (!path) {
    return API_BASE_URL;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const shouldQueueOffline = Boolean(options.offlineQueue);
  const url = buildUrl(path);

  if (!headers.has('Content-Type') && options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = getCookieValue('csrf_token');
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  if (shouldQueueOffline && options.body instanceof FormData) {
    throw new Error('Offline queueing currently supports JSON requests only.');
  }

  if (shouldQueueOffline && MUTATING_METHODS.has(method) && !navigator.onLine) {
    await queueOfflineRequest({
      url,
      method,
      headers,
      body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body || {}),
    });

    return {
      queued: true,
      offline: true,
      message: 'Expense saved locally and will sync automatically when you are back online.',
    };
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if (shouldQueueOffline && MUTATING_METHODS.has(method)) {
      await queueOfflineRequest({
        url,
        method,
        headers,
        body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body || {}),
      });

      return {
        queued: true,
        offline: true,
        message: 'Network unavailable. FinTrackr queued this expense and will retry in the background.',
      };
    }
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null ? payload.detail : null;
    const err = new Error(detail || response.statusText || 'Request failed');
    err.status = response.status;
    throw err;
  }

  return payload;
}
