import { Check, Loader2 } from 'lucide-react';

/**
 * Real agent progress, driven by SSE `phase` events.
 *
 * The page it replaces faked this with `setTimeout(…, 1200)` and animated
 * typing dots — there was no work happening behind them. Each step below
 * corresponds to an actual stage of the orchestrator, so a slow question shows
 * where the time is going.
 *
 * The order matches the pipeline in analytics_agent_service.py.
 */
const STEPS = [
  { name: 'context', label: 'Reading your expense profile' },
  { name: 'planning', label: 'Understanding your question' },
  { name: 'validating', label: 'Checking the query is safe' },
  { name: 'executing', label: 'Querying your expenses' },
  { name: 'charting', label: 'Preparing the answer' },
];

const ORDER = STEPS.reduce((map, step, index) => {
  map[step.name] = index;
  return map;
}, {});

export default function AgentProgress({ phase, label }) {
  // 'queued' precedes everything; 'fallback' is off the happy path and gets
  // its own single-line treatment.
  if (phase === 'fallback') {
    return (
      <div className="insights-progress" role="status" aria-live="polite">
        <div className="insights-progress-step insights-progress-step--active">
          <Loader2 size={14} className="insights-progress-spin" aria-hidden="true" />
          <span>{label || 'Using offline analytics'}</span>
        </div>
      </div>
    );
  }

  const activeIndex = phase in ORDER ? ORDER[phase] : -1;

  return (
    <div className="insights-progress" role="status" aria-live="polite">
      {STEPS.map((step, index) => {
        const done = activeIndex > index;
        const active = activeIndex === index;

        // Steps not yet reached are rendered dimmed rather than hidden, so the
        // list does not reflow as it advances.
        return (
          <div
            key={step.name}
            className={[
              'insights-progress-step',
              done ? 'insights-progress-step--done' : '',
              active ? 'insights-progress-step--active' : '',
            ].filter(Boolean).join(' ')}
          >
            {done ? (
              <Check size={14} aria-hidden="true" />
            ) : active ? (
              <Loader2 size={14} className="insights-progress-spin" aria-hidden="true" />
            ) : (
              <span className="insights-progress-dot" aria-hidden="true" />
            )}
            <span>{active && label ? label : step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
