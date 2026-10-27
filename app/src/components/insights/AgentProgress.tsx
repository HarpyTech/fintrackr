import type { AgentPhase } from '../../types';

const STEP_LABELS: Record<string, string> = {
  queued:    'Processing your question…',
  context:   'Processing your question…',
  planning:  'Processing your question…',
  validating:'Processing your question…',
  executing: 'Processing your question…',
  charting:  'Processing your question…',
  fallback:  'Processing your question…',
};

export default function AgentProgress({ phase }: { phase: AgentPhase; label?: string }) {
  const text = STEP_LABELS[phase] || 'Processing your question…';
  return (
    <div className="insights-progress" role="status" aria-live="polite">
      <span className="insights-progress-dot-pulse" aria-hidden="true" />
      <span className="insights-progress-text">{text}</span>
    </div>
  );
}
