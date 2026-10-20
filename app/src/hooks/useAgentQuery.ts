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
  const [pendingQuestion, setPendingQuestion] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Ref-based guard prevents double-submission during the same render cycle
  // before the streaming state update has been applied.
  const streamingRef = useRef(false);

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
          setAnswers((prev) => {
            const existingIds = new Set(prev.map((a) => a.answer_id));
            const fresh = data.items.filter((item) => !existingIds.has(item.answer_id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
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
      streamingRef.current = false;
      setStreaming(false);
      setPhase('');
      setPhaseLabel('');
      setPendingQuestion('');
    }
  }, []);

  const receive = useCallback((answer: AnalyticsAnswer | null) => {
    if (!mountedRef.current || !answer) return;
    setAnswers((prev) =>
      prev.some((a) => a.answer_id === answer.answer_id) ? prev : [...prev, answer],
    );
  }, []);

  const askQuestion = useCallback(async (question: string) => {
    const trimmed = (question || '').trim();
    if (!trimmed || streamingRef.current) return;

    // A new question supersedes any in-flight one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    streamingRef.current = true;
    setStreaming(true);
    setPendingQuestion(trimmed);
    setPhase('queued');
    setPhaseLabel('');

    try {
      if (supportsStreaming()) {
        await streamAsk(trimmed, {
          signal: controller.signal,
          onPhase: (name) => {
            if (!mountedRef.current) return;
            setPhase(name);
            setPhaseLabel('');
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
      if (mountedRef.current && !agentError?.sessionExpired) {
        // Add a synthetic error card to the thread instead of a top-level banner.
        receive({
          answer_id: `err-${Date.now()}`,
          question: trimmed,
          status: 'error',
          datasets: [],
          visuals: [],
        });
      }
    } finally {
      if (mountedRef.current) {
        streamingRef.current = false;
        setStreaming(false);
        setPhase('');
        setPhaseLabel('');
        setPendingQuestion('');
        abortRef.current = null;
      }
    }
  }, [receive]);

  const clear = useCallback(() => {
    setAnswers([]);
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
  };
}

export default useAgentQuery;
