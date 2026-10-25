import { emitUnauthorized, notifyWarning } from './notify';
import { getUserTimezone } from './timezone';
import type { AgentPhase, AnalyticsAnswer } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

/**
 * SSE client for the analytics agent.
 *
 * Uses fetch + ReadableStream rather than EventSource, which cannot issue a
 * POST and cannot set the X-CSRF-Token header the CSRF middleware requires on
 * every mutating request.
 *
 * Mirrors api.ts's error semantics so callers behave consistently: a 401 emits
 * the session-expiry event, a 429 raises the rate-limit toast.
 */

interface StreamError extends Error {
  status?: number;
  sessionExpired?: boolean;
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

/** True when the browser can consume a streamed response body. */
export function supportsStreaming(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.ReadableStream === 'function' &&
    typeof TextDecoder === 'function'
  );
}

interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Parse a chunk of SSE text into complete events.
 * Returns [events, remainder] — the remainder is an incomplete trailing frame.
 */
function parseFrames(buffer: string): [SseEvent[], string] {
  const events: SseEvent[] = [];
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';

  for (const frame of frames) {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) continue;

    try {
      events.push({ event, data: JSON.parse(dataLines.join('\n')) });
    } catch {
      // A frame we cannot parse is dropped rather than aborting the stream.
    }
  }

  return [events, remainder];
}

export interface StreamAskOptions {
  sessionId?: string;
  onPhase?: (name: AgentPhase, label: string) => void;
  onPartial?: (data: unknown) => void;
  onDone?: (answer: AnalyticsAnswer) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Ask the agent, streaming progress.
 *
 * @returns the final answer envelope, or null if aborted.
 */
export async function streamAsk(
  question: string,
  { sessionId = '', onPhase, onPartial, onDone, onError, signal }: StreamAskOptions = {},
): Promise<AnalyticsAnswer | null> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'X-Timezone': getUserTimezone(),
  });

  const csrfToken = getCookieValue('csrf_token');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

  const response = await fetch(`${API_BASE_URL}/insights/ask/stream`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ question, session_id: sessionId }),
    signal,
  });

  if (!response.ok) {
    let detail = response.statusText || 'Request failed';
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // Non-JSON error body; keep the status text.
    }

    if (response.status === 401) {
      emitUnauthorized('/insights/ask/stream');
      const err: StreamError = new Error('Your session has expired. Please sign in again.');
      err.status = 401;
      err.sessionExpired = true;
      throw err;
    }

    if (response.status === 429) {
      notifyWarning(detail);
    }

    const err: StreamError = new Error(detail);
    err.status = response.status;
    throw err;
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this browser.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer: AnalyticsAnswer | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const [events, remainder] = parseFrames(buffer);
      buffer = remainder;

      for (const { event, data } of events) {
        if (event === 'phase') {
          const phaseData = data as { name: AgentPhase; label: string };
          onPhase?.(phaseData.name, phaseData.label);
        } else if (event === 'partial') {
          onPartial?.(data);
        } else if (event === 'done') {
          answer = data as AnalyticsAnswer;
          onDone?.(answer);
        } else if (event === 'error') {
          const errorData = data as { detail?: string };
          const err = new Error(errorData.detail || 'The agent failed.');
          onError?.(err);
          throw err;
        }
      }
    }
  } finally {
    // Releasing the lock lets the connection close promptly on abort.
    try {
      reader.releaseLock();
    } catch {
      // Already released.
    }
  }

  return answer;
}

/** Non-streaming fallback, same envelope. */
export async function ask(
  question: string,
  { sessionId = '', signal }: { sessionId?: string; signal?: AbortSignal } = {},
): Promise<AnalyticsAnswer> {
  const { apiRequest } = await import('./api');
  return apiRequest<AnalyticsAnswer>('/insights/ask', {
    method: 'POST',
    body: JSON.stringify({ question, session_id: sessionId }),
    signal,
  });
}
