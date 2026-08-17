import { queueOfflineRequest } from '../pwa/offlineQueue';
import { emitUnauthorized, notifyInfo, notifyWarning } from './notify';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Endpoints that legitimately answer 401 for an anonymous visitor.
 *
 * `/auth/session` is probed on every cold start and `/auth/login` returns 401
 * for bad credentials, so treating their 401s as "session expired" would fire
 * a redirect on the login page itself and loop.
 */
const ANONYMOUS_401_PATHS = [
  '/auth/session',
  '/auth/login',
  '/auth/refresh',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/webauthn/authenticate',
];

function isAnonymous401Path(path) {
  const normalized = `/${String(path || '').replace(/^\/+/, '')}`;
  return ANONYMOUS_401_PATHS.some((candidate) => normalized.startsWith(candidate));
}

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

    const message =
      'Expense saved locally and will sync automatically when you are back online.';
    notifyInfo(message);
    return { queued: true, offline: true, message };
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

      const message =
        'Network unavailable. FinTrackr queued this expense and will retry in the background.';
      notifyInfo(message);
      return { queued: true, offline: true, message };
    }
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null ? payload.detail : null;

    // Session expiry — the token was accepted before but is no longer valid.
    // Endpoints that answer 401 for anonymous visitors are excluded so the
    // cold-start session probe and failed logins do not trigger a redirect.
    if (response.status === 401 && !isAnonymous401Path(path)) {
      emitUnauthorized(path);
      const err = new Error(detail || 'Your session has expired. Please sign in again.');
      err.status = 401;
      err.sessionExpired = true;
      throw err;
    }

    // Rate limited — surface the backend's own message when it supplies one.
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitHint = retryAfter ? ` Try again in ${retryAfter}s.` : ' Please try again shortly.';
      const message = detail || `Too many requests.${waitHint}`;
      notifyWarning(message);
      const err = new Error(message);
      err.status = 429;
      err.retryAfter = retryAfter ? Number(retryAfter) : null;
      throw err;
    }

    const err = new Error(detail || response.statusText || 'Request failed');
    err.status = response.status;
    throw err;
  }

  return payload;
}
