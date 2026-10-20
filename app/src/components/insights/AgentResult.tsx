import { AlertCircle, RefreshCw } from 'lucide-react';
import KpiGrid from './KpiGrid';
import VisualRenderer from './VisualRenderer';
import type { AnalyticsAnswer, AnalyticsDataset } from '../../types';

function Markdownish({ text }: { text?: string }) {
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

export default function AgentResult({
  answer,
  onRetry,
}: {
  answer: AnalyticsAnswer;
  onRetry?: (question: string) => void;
}) {
  if (!answer) return null;

  const { question, status, narrative, datasets = [], visuals = [] } = answer;

  if (status === 'error') {
    return (
      <article className="insights-result insights-result--error">
        <p className="insights-result-error-msg">
          <AlertCircle size={15} aria-hidden="true" />
          We couldn't load this right now.
        </p>
        {onRetry ? (
          <button
            type="button"
            className="insights-result-retry"
            onClick={() => onRetry(question)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Try again
          </button>
        ) : null}
      </article>
    );
  }

  const datasetById = datasets.reduce<Record<string, AnalyticsDataset>>((map, ds) => {
    map[ds.id] = ds;
    return map;
  }, {});

  return (
    <article className="insights-result">
      <header className="insights-result-head">
        <h2 className="insights-result-headline">
          {narrative?.headline || (status === 'empty' ? 'No results found' : 'Result')}
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
    </article>
  );
}
