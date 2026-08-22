import { AlertCircle, HelpCircle } from 'lucide-react';
import KpiGrid from './KpiGrid';
import QueryTransparency from './QueryTransparency';
import VisualRenderer from './VisualRenderer';

/**
 * Renders one complete agent answer.
 *
 * Order is deliberate: the headline and figures first (what you asked), then
 * the charts, then the prose, then how it was calculated. A reader who trusts
 * the answer never has to open the transparency panel; a reader who does not
 * has it right there.
 *
 * Every branch is driven by the envelope's stable keys, so a question type the
 * UI has never seen still renders.
 */
function Markdownish({ text }) {
  // The narrative uses only **bold** and paragraph breaks, so a full markdown
  // parser would be a dependency for two features. Anything else is rendered
  // literally rather than interpreted, which also keeps it injection-safe.
  if (!text) return null;

  return (
    <div className="insights-narrative">
      {text.split(/\n{2,}/).map((paragraph, pIndex) => (
        <p key={pIndex}>
          {paragraph.split(/(\*\*[^*]+\*\*)/g).map((chunk, cIndex) =>
            chunk.startsWith('**') && chunk.endsWith('**') ? (
              <strong key={cIndex}>{chunk.slice(2, -2)}</strong>
            ) : (
              chunk
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export default function AgentResult({ answer, onFollowup }) {
  if (!answer) return null;

  const {
    question,
    status,
    narrative,
    datasets = [],
    visuals = [],
    query,
    confidence,
    followups = [],
    degraded,
  } = answer;

  const datasetById = datasets.reduce((map, dataset) => {
    map[dataset.id] = dataset;
    return map;
  }, {});

  const refused = status === 'refused';

  return (
    <article className="insights-result">
      <header className="insights-result-head">
        <p className="insights-result-question">{question}</p>
        <h2 className="insights-result-headline">
          {refused ? (
            <HelpCircle size={18} aria-hidden="true" className="insights-result-icon" />
          ) : null}
          {narrative?.headline || 'Result'}
        </h2>
      </header>

      {narrative?.highlights?.length ? (
        <KpiGrid highlights={narrative.highlights} />
      ) : null}

      {visuals.map((visual) => (
        <VisualRenderer
          key={visual.id}
          visual={visual}
          dataset={datasetById[visual.dataset_id]}
        />
      ))}

      <Markdownish text={narrative?.body_md} />

      {answer.error?.reason && !refused ? (
        <p className="insights-result-warning">
          <AlertCircle size={14} aria-hidden="true" />
          {answer.error.reason}
        </p>
      ) : null}

      <QueryTransparency query={query} confidence={confidence} degraded={degraded} />

      {followups.length ? (
        <footer className="insights-result-followups">
          <span className="insights-result-followups-label">Next</span>
          <div className="insights-result-followup-pills">
            {followups.map((followup) => (
              <button
                key={followup}
                type="button"
                className="insights-proto-quick-btn"
                onClick={() => onFollowup?.(followup)}
              >
                {followup}
              </button>
            ))}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
