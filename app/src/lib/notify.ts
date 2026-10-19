/**
 * Framework-free notification bridge.
 *
 * `api.ts` is a plain module and cannot call React hooks, so it publishes
 * toast requests through a DOM CustomEvent. ToastProvider subscribes to that
 * event and renders them. This keeps the fetch layer free of React imports
 * and avoids a circular dependency between api.ts and the provider.
 */

export const TOAST_EVENT = 'fintrackr:toast';
export const UNAUTHORIZED_EVENT = 'fintrackr:unauthorized';

export type ToastTone = 'info' | 'success' | 'error' | 'warning';

export interface ToastDetail {
  message: string;
  tone?: ToastTone;
  duration?: number;
}

/** Request a toast. */
export function notify(detail: ToastDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

export const notifySuccess = (message: string, duration?: number) =>
  notify({ message, tone: 'success', duration });

export const notifyError = (message: string, duration?: number) =>
  notify({ message, tone: 'error', duration });

export const notifyWarning = (message: string, duration?: number) =>
  notify({ message, tone: 'warning', duration });

export const notifyInfo = (message: string, duration?: number) =>
  notify({ message, tone: 'info', duration });

/**
 * Signal that the server rejected a request with 401 on an endpoint that
 * requires an established session. AuthContext decides whether this is a
 * genuine expiry or simply an unauthenticated visitor.
 */
export function emitUnauthorized(path: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path } }));
}
