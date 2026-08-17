/**
 * Framework-free notification bridge.
 *
 * `api.js` is a plain module and cannot call React hooks, so it publishes
 * toast requests through a DOM CustomEvent. ToastProvider subscribes to that
 * event and renders them. This keeps the fetch layer free of React imports
 * and avoids a circular dependency between api.js and the provider.
 */

export const TOAST_EVENT = 'fintrackr:toast';
export const UNAUTHORIZED_EVENT = 'fintrackr:unauthorized';

/**
 * Request a toast.
 * @param {{message: string, tone?: 'info'|'success'|'error'|'warning', duration?: number}} detail
 */
export function notify(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export const notifySuccess = (message, duration) =>
  notify({ message, tone: 'success', duration });

export const notifyError = (message, duration) =>
  notify({ message, tone: 'error', duration });

export const notifyWarning = (message, duration) =>
  notify({ message, tone: 'warning', duration });

export const notifyInfo = (message, duration) =>
  notify({ message, tone: 'info', duration });

/**
 * Signal that the server rejected a request with 401 on an endpoint that
 * requires an established session. AuthContext decides whether this is a
 * genuine expiry or simply an unauthenticated visitor.
 */
export function emitUnauthorized(path) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path } }));
}
