import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { TOAST_EVENT, ToastDetail, ToastTone } from '../lib/notify';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  push: (detail: ToastDetail) => number | null;
  dismiss: (id: number) => void;
  success: (message: string, duration?: number) => number | null;
  error: (message: string, duration?: number) => number | null;
  warning: (message: string, duration?: number) => number | null;
  info: (message: string, duration?: number) => number | null;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const DEFAULT_DURATION = 4200;
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<number, number>());
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ message, tone = 'info', duration = DEFAULT_DURATION }: ToastDetail): number | null => {
      if (!message) return null;

      idRef.current += 1;
      const id = idRef.current;

      setToasts((current) => {
        // Collapse duplicates so a burst of identical failures (for example
        // four dashboard summary calls failing at once) shows a single toast.
        if (current.some((toast) => toast.message === message)) {
          return current;
        }
        return [...current, { id, message, tone }].slice(-MAX_VISIBLE);
      });

      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  // Bridge CustomEvents emitted by the non-React fetch layer.
  useEffect(() => {
    function handleToastEvent(event: Event) {
      push((event as CustomEvent<ToastDetail>).detail || { message: '' });
    }

    window.addEventListener(TOAST_EVENT, handleToastEvent);
    return () => window.removeEventListener(TOAST_EVENT, handleToastEvent);
  }, [push]);

  // Clear pending timers on unmount so no setState fires after teardown.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      success: (message: string, duration?: number) => push({ message, tone: 'success', duration }),
      error: (message: string, duration?: number) => push({ message, tone: 'error', duration }),
      warning: (message: string, duration?: number) => push({ message, tone: 'warning', duration }),
      info: (message: string, duration?: number) => push({ message, tone: 'info', duration }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone] || Info;
          return (
            <div
              key={toast.id}
              className={`toast toast-${toast.tone}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            >
              <span className="toast-icon" aria-hidden="true">
                <Icon />
              </span>
              <p className="toast-message">{toast.message}</p>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                <X />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
