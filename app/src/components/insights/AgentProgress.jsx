const STEP_LABELS = {
  queued:    'Getting ready…',
  context:   'Reading your expense profile…',
  planning:  'Understanding your question…',
  validating:'Checking the query is safe…',
  executing: 'Querying your expenses…',
  charting:  'Preparing the answer…',
  fallback:  'Using offline analytics…',
};

export default function AgentProgress({ phase, label }) {
  const text = label || STEP_LABELS[phase] || 'Thinking…';
  return (
    <div className="insights-progress" role="status" aria-live="polite">
      <span className="insights-progress-dot-pulse" aria-hidden="true" />
      <span className="insights-progress-text">{text}</span>
    </div>
  );
}
