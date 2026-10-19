import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { ask, streamAsk, supportsStreaming } from '../lib/insightsStream';
import type { AgentPhase, AnalyticsAnswer, AnalyticsHistoryResponse } from '../types';

interface AgentQueryError extends Error {
  sessionExpired?: boolean;
}

/**
 * Drives one analytics conversation.
 *
 * Owns the answer history, the live progress phase, and cancellation. Streams
 * when the browser can, and silently falls back to the plain POST endpoint
 * when it cannot — both return the identical envelope, so nothing downstream
 * branches on which path was used.
 *
 * History is seeded on mount from the server so the conversation survives
 * navigation and page refreshes (90-day TTL on the backend).
 */
export function useAgentQuery() {
  const [answers, setAnswers] = useState<AnalyticsAnswer[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<AgentPhase>('');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [error, setError] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Load the last 20 answers from the server on mount.
  useEffect(() => {
    let active = true;
    apiRequest<AnalyticsHistoryResponse>('/insights/history')
      .then((data) => {
        if (active && data?.items?.length) {
          setAnswers(data.items);
        }
      })
      .catch(() => {
        // History is non-critical — silently ignore failures.
      });
    return () => { active = false; };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (mountedRef.current) {
      setStreaming(false);
      setPhase('');
      setPhaseLabel('');
      setPendingQuestion('');
    }
  }, []);

  const askQuestion = useCallback(async (question: string) => {
    const trimmed = (question || '').trim();
    if (!trimmed || streaming) return;

    // A new question supersedes any in-flight one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setError('');
    setPendingQuestion(trimmed);
    setPhase('queued');
    setPhaseLabel('Starting');

    const receive = (answer: AnalyticsAnswer | null) => {
      if (!mountedRef.current || !answer) return;
      // Oldest first — chat transcript order.
      setAnswers((prev) => [...prev, answer]);
    };

    try {
      if (supportsStreaming()) {
        await streamAsk(trimmed, {
          signal: controller.signal,
          onPhase: (name, label) => {
            if (!mountedRef.current) return;
            setPhase(name);
            setPhaseLabel(label || '');
          },
          onDone: receive,
        });
      } else {
        const answer = await ask(trimmed, { signal: controller.signal });
        receive(answer);
      }
    } catch (err) {
      const agentError = err as AgentQueryError;
      if (agentError?.name === 'AbortError') return;
      // A 401 is already handled globally: apiRequest/streamAsk raise the
      // session-expiry event and the user is redirected.
      if (mountedRef.current && !agentError?.sessionExpired) {
        setError(agentError?.message || 'Could not answer that question.');
      }
    } finally {
      if (mountedRef.current) {
        setStreaming(false);
        setPhase('');
        setPhaseLabel('');
        setPendingQuestion('');
        abortRef.current = null;
      }
    }
  }, [streaming]);

  const clear = useCallback(() => {
    setAnswers([]);
    setError('');
  }, []);

  return {
    answers,
    ask: askQuestion,
    cancel,
    clear,
    streaming,
    phase,
    phaseLabel,
    pendingQuestion,
    error,
  };
}

export default useAgentQuery;
