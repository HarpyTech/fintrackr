import { queueOfflineRequest } from '../pwa/offlineQueue';
import { emitUnauthorized, notifyInfo, notifyWarning } from './notify';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ANONYMOUS_401_PATHS = [
  '/auth/session',
  '/auth/login',
  '/auth/refresh',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/webauthn/authenticate',
];

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string> | Headers;
  offlineQueue?: boolean;
}

interface ApiError extends Error {
  status?: number;
  sessionExpired?: boolean;
  retryAfter?: number | null;
}

function isAnonymous401Path(path: string): boolean {
  const normalized = `/${String(path || '').replace(/^\/+/, '')}`;
  return ANONYMOUS_401_PATHS.some((candidate) => normalized.startsWith(candidate));
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const pairs = document.cookie ? document.cookie.split('; ') : [];
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function buildUrl(path: string): string {
  if (!path) return API_BASE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers((options.headers as Record<string, string>) || {});
  const shouldQueueOffline = Boolean(options.offlineQueue);
  const url = buildUrl(path);

  if (
    !headers.has('Content-Type') &&
    options.body !== undefined &&
    !(options.body instanceof FormData)
  ) {
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
      body:
        typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body || {}),
    });
    const message =
      'Expense saved locally and will sync automatically when you are back online.';
    notifyInfo(message);
    return { queued: true, offline: true, message };
  }

  let response: Response;
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
        body:
          typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body || {}),
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
    const body =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : null;
    // Support both the new {code, message, trace_id} envelope and the legacy {detail} shape.
    const errorText =
      ((body?.message || body?.detail) as string | undefined) ||
      response.statusText ||
      'Request failed';

    if (response.status === 401 && !isAnonymous401Path(path)) {
      emitUnauthorized(path);
      const err: ApiError = new Error(errorText || 'Your session has expired. Please sign in again.');
      err.status = 401;
      err.sessionExpired = true;
      throw err;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitHint = retryAfter ? ` Try again in ${retryAfter}s.` : ' Please try again shortly.';
      const message = errorText || `Too many requests.${waitHint}`;
      notifyWarning(message);
      const err: ApiError = new Error(message);
      err.status = 429;
      err.retryAfter = retryAfter ? Number(retryAfter) : null;
      throw err;
    }

    const err: ApiError = new Error(errorText);
    err.status = response.status;
    throw err;
  }

  return payload;
}
