import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatInr } from '../../lib/chartColors';

/**
 * Headline figures for an agent answer.
 *
 * Reuses the existing `insights-proto-card--*` colour themes, cycling by
 * index so a row of highlights keeps the page's established palette.
 *
 * Every value here is computed server-side from the query result — this
 * replaces the old at-a-glance strip whose growth figures came from hardcoded
 * multipliers.
 */
const THEMES = ['blue', 'purple', 'green', 'orange'];

function formatValue(value, format) {
  if (value === null || value === undefined) return '—';
  if (format === 'currency') return formatInr(value);
  if (format === 'number') {
    return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value);
  }
  if (format === 'percent') {
    return `${Number(value).toFixed(1)}%`;
  }
  return String(value);
}

function DeltaBadge({ deltaPct, direction }) {
  if (deltaPct === null || deltaPct === undefined) return null;

  const modifier =
    direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'flat';
  const Icon =
    direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span className={`insights-proto-card-badge insights-proto-card-badge--${modifier}`}>
      <Icon size={13} aria-hidden="true" />
      {Math.abs(Number(deltaPct)).toFixed(1)}%
    </span>
  );
}

export default function KpiGrid({ highlights }) {
  const items = (highlights || []).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="insights-kpi-grid">
      {items.map((item, index) => (
        <article
          key={`${item.label}-${index}`}
          className={`insights-proto-card insights-proto-card--${THEMES[index % THEMES.length]}`}
        >
          <span className="insights-proto-card-label">{item.label}</span>
          <span className="insights-proto-card-value">
            {formatValue(item.value, item.format)}
          </span>
          <DeltaBadge deltaPct={item.delta_pct} direction={item.direction} />
        </article>
      ))}
    </div>
  );
}
