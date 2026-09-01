import { useState } from 'react';
import { Check, Copy, Database } from 'lucide-react';

/**
 * Shows exactly which query produced an answer.
 *
 * This exists because the answer is generated: a user has no way to judge a
 * figure without seeing what was counted. It surfaces the real executed
 * pipeline — including the server-injected `{$match: {username}}` scope stage
 * — so the numbers are auditable rather than taken on trust.
 *
 * Collapsed by default; the summary line carries the useful facts.
 */
export default function QueryTransparency({ query, confidence, degraded }) {
  const [copied, setCopied] = useState(false);

  if (!query && !confidence?.caveats?.length) return null;

  const body = query?.pipeline || query?.filter || null;
  const serialized = body ? JSON.stringify(body, null, 2) : '';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked by permissions; the text is still visible.
    }
  }

  const level = confidence?.level || 'low';
  const summaryParts = [];
  if (query?.row_count !== undefined) {
    summaryParts.push(`${query.row_count} row${query.row_count === 1 ? '' : 's'}`);
  }
  if (query?.collection) summaryParts.push(query.collection);
  if (query?.executed_ms !== undefined) summaryParts.push(`${query.executed_ms} ms`);

  return (
    <details className="insights-transparency">
      <summary className="insights-transparency-summary">
        <Database size={14} aria-hidden="true" />
        <span>How this was calculated</span>
        {summaryParts.length ? (
          <span className="insights-transparency-facts">
            {summaryParts.join(' · ')}
          </span>
        ) : null}
        <span className={`insights-confidence insights-confidence--${level}`}>
          {level} confidence
        </span>
      </summary>

      <div className="insights-transparency-body">
        {degraded ? (
          <p className="insights-transparency-note">
            Answered without AI query planning — the deterministic fallback was
            used.
          </p>
        ) : null}

        {query?.explain ? (
          <p className="insights-transparency-explain">{query.explain}</p>
        ) : null}

        {query?.repaired ? (
          <p className="insights-transparency-note">
            The first generated query was rejected by the validator and rebuilt.
          </p>
        ) : null}

        {confidence?.caveats?.length ? (
          <ul className="insights-transparency-caveats">
            {confidence.caveats.map((caveat, index) => (
              <li key={index}>{caveat}</li>
            ))}
          </ul>
        ) : null}

        {serialized ? (
          <>
            <div className="insights-transparency-code-head">
              <span>
                {query.op === 'find' ? 'Filter' : 'Aggregation pipeline'}
                {query.collection ? ` · ${query.collection}` : ''}
              </span>
              <button
                type="button"
                className="insights-transparency-copy"
                onClick={handleCopy}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="insights-transparency-code">{serialized}</pre>
          </>
        ) : null}
      </div>
    </details>
  );
}
