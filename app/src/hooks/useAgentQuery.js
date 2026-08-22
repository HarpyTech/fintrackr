import { useCallback, useEffect, useRef, useState } from 'react';
import { ask, streamAsk, supportsStreaming } from '../lib/insightsStream';

/**
 * Drives one analytics conversation.
 *
 * Owns the answer history, the live progress phase, and cancellation. Streams
 * when the browser can, and silently falls back to the plain POST endpoint
 * when it cannot — both return the identical envelope, so nothing downstream
 * branches on which path was used.
 */
export function useAgentQuery() {
  const [answers, setAnswers] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [error, setError] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');

  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
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

  const askQuestion = useCallback(async (question) => {
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

    const receive = (answer) => {
      if (!mountedRef.current || !answer) return;
      // Newest first — the page shows the latest answer at the top.
      setAnswers((current) => [answer, ...current]);
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
      if (err?.name === 'AbortError') return;
      // A 401 is already handled globally: apiRequest/streamAsk raise the
      // session-expiry event and the user is redirected.
      if (mountedRef.current && !err?.sessionExpired) {
        setError(err?.message || 'Could not answer that question.');
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
