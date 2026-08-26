import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  DollarSign,
  Layers,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import AgentProgress from '../components/insights/AgentProgress';
import AgentResult from '../components/insights/AgentResult';
import EmptyState from '../components/EmptyState';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAgentQuery } from '../hooks/useAgentQuery';
import { formatInr } from '../lib/chartColors';
import { queryKeys } from '../lib/queryClient';

const SUGGESTIONS = [
  'How much did I spend last month?',
  'Top 5 vendors this year',
  'Compare this month to last month',
  'Which category grew the most?',
  'Show my monthly trend',
];

function KpiTile({ icon: Icon, tone, label, value, meta, deltaPct, direction }) {
  const DeltaIcon = direction === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="insights-proto-stat">
      <Icon
        size={16}
        className={`insights-proto-stat-icon insights-proto-stat-icon-${tone}`}
        aria-hidden="true"
      />
      <div className="insights-proto-stat-body">
        <span className="insights-proto-stat-label">{label}</span>
        <span className="insights-proto-stat-value">{value}</span>
        {deltaPct !== null && deltaPct !== undefined ? (
          <span
            className={`insights-proto-card-badge insights-proto-card-badge--${
              direction === 'down' ? 'down' : 'up'
            }`}
          >
            <DeltaIcon size={12} aria-hidden="true" />
            {Math.abs(deltaPct).toFixed(1)}% vs last month
          </span>
        ) : meta ? (
          <span className="insights-proto-stat-meta">{meta}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const chatRef = useRef(null);

  const {
    answers, ask, cancel, streaming, phase, phaseLabel, pendingQuestion, error,
  } = useAgentQuery();

  const overviewQuery = useQuery({
    queryKey: queryKeys.insights.overview(),
  });
  const overview = overviewQuery.data;

  // Scroll chat to bottom whenever a new answer lands or streaming starts.
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [answers.length, streaming]);

  function submit(question) {
    const trimmed = (question ?? input).trim();
    if (!trimmed || streaming) return;
    ask(trimmed);
    setInput('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const monthDelta = overview?.month_delta_pct;
  const hasHistory = answers.length > 0 || streaming;

  return (
    <div className="insights-proto">
      <div className="insights-proto-body">

        {/* ── KPI strip (top) ── */}
        <div className="insights-proto-stats-bar">
          <div className="insights-proto-stats-inner">
            {overviewQuery.isPending ? (
              [0, 1, 2, 3].map((index) => (
                <div className="insights-proto-stat" key={index}>
                  <div className="skeleton skeleton-text" style={{ width: '120px' }} />
                </div>
              ))
            ) : (
              <>
                <KpiTile
                  icon={DollarSign}
                  tone="blue"
                  label="This month"
                  value={formatInr(overview?.this_month)}
                  deltaPct={monthDelta}
                  direction={monthDelta >= 0 ? 'up' : 'down'}
                />
                <KpiTile
                  icon={BarChart3}
                  tone="green"
                  label="All time"
                  value={formatInr(overview?.total_spend)}
                  meta={`${overview?.total_transactions ?? 0} transactions`}
                />
                <KpiTile
                  icon={Layers}
                  tone="purple"
                  label="Categories"
                  value={overview?.active_categories ?? 0}
                  meta={
                    overview?.top_category
                      ? `Top: ${overview.top_category.name}`
                      : 'No categories yet'
                  }
                />
                <KpiTile
                  icon={Sparkles}
                  tone="orange"
                  label="Last month"
                  value={formatInr(overview?.last_month)}
                  meta="For comparison"
                />
              </>
            )}
          </div>
        </div>

        {/* ── Chat transcript (scrollable middle) ── */}
        <div className="insights-chat" ref={chatRef}>
          {!hasHistory && !error ? (
            <EmptyState
              icon={Sparkles}
              title="Ask your first question"
              body="Every answer is generated from a real query against your own
                    expenses, and you can inspect exactly what was run."
            />
          ) : null}

          {error ? (
            <p className="error-text insights-results-error">{error}</p>
          ) : null}

          {/* Completed turns — oldest first */}
          {answers.map((answer) => (
            <div key={answer.answer_id} className="insights-chat-turn">
              <div className="insights-chat-bubble">
                <p>{answer.question}</p>
              </div>
              <div className="insights-chat-response">
                <ErrorBoundary
                  label={`answer ${answer.answer_id}`}
                  title="This answer could not be displayed"
                  body="Try asking the question again."
                >
                  <AgentResult answer={answer} onFollowup={submit} />
                </ErrorBoundary>
              </div>
            </div>
          ))}

          {/* In-flight turn */}
          {streaming ? (
            <div className="insights-chat-turn">
              <div className="insights-chat-bubble">
                <p>{pendingQuestion}</p>
              </div>
              <div className="insights-chat-response">
                <AgentProgress phase={phase} label={phaseLabel} />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Query bar (pinned bottom) ── */}
        <div className="insights-query-bar">
          <div className="insights-query-inner">
            {!hasHistory ? (
              <div className="insights-proto-quick-pills">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="insights-proto-quick-btn"
                    onClick={() => submit(suggestion)}
                    disabled={streaming}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="insights-query-field">
              <Sparkles size={18} className="insights-query-icon" aria-hidden="true" />
              <textarea
                ref={textareaRef}
                className="insights-proto-textarea insights-query-textarea"
                placeholder="Ask anything about your spending…"
                value={input}
                rows={1}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
                aria-label="Ask a question about your expenses"
              />
              {streaming ? (
                <button
                  type="button"
                  className="insights-query-send insights-query-send--cancel"
                  onClick={cancel}
                  aria-label="Cancel"
                >
                  <X size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  className="insights-query-send"
                  onClick={() => submit()}
                  disabled={!input.trim()}
                  aria-label="Ask"
                >
                  <Send size={17} />
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
