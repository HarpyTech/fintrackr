import BreakdownChart from '../charts/BreakdownChart';
import CategoryTrendChart from '../charts/CategoryTrendChart';
import TrendBarChart from '../charts/TrendBarChart';
import ErrorBoundary from '../ErrorBoundary';
import DataTable from './DataTable';
import KpiGrid from './KpiGrid';
import { CHART_ACCENT, CHART_ACCENT_ALT, formatInr } from '../../lib/chartColors';
import { useChartLayout } from '../../hooks/useChartLayout';

/**
 * Maps a server visual spec onto a chart component.
 *
 * This registry is the only place that needs to change when a new chart type
 * is added — the page, the agent and the API contract all stay the same.
 *
 * The server sends chart kind + encoding + data. It deliberately does NOT
 * send colours, tick counts, slice caps or radii: those depend on viewport
 * and theme, which the server cannot observe. The chart components below
 * apply them via useChartLayout()/useChartTheme(), so a breakdown of 30
 * vendors is still capped to 5 slices on a phone and 7 on a desktop.
 */
function resolveColor(name) {
  return name === 'accent_alt' ? CHART_ACCENT_ALT : CHART_ACCENT;
}

const CHART_REGISTRY = {
  trend_bar: ({ visual, dataset, size }) => (
    <TrendBarChart
      items={dataset.rows}
      xKey={visual.encoding?.x}
      valueKey={visual.encoding?.value || 'total'}
      xLabel={visual.encoding?.x_label || ''}
      color={resolveColor(visual.color)}
      size={size}
      emptyTitle="Nothing to chart"
      emptyBody="This query returned no rows to plot."
    />
  ),

  breakdown: ({ visual, dataset, size }) => (
    <BreakdownChart
      items={dataset.rows}
      nameKey={visual.encoding?.name || visual.encoding?.x}
      valueKey={visual.encoding?.value || 'total'}
      size={size}
      emptyTitle="Nothing to chart"
      emptyBody="This query returned no rows to plot."
    />
  ),

  category_trend: ({ dataset, size }) => (
    <CategoryTrendChart
      items={dataset.rows}
      size={size}
      emptyTitle="Nothing to compare"
      emptyBody="This query returned no rows to compare."
    />
  ),

  table: ({ dataset }) => <DataTable dataset={dataset} />,

  kpi: ({ visual, dataset }) => {
    const key = visual.encoding?.value;
    const row = dataset.rows?.[0] || {};
    return (
      <KpiGrid
        highlights={[
          {
            label: visual.title || 'Total',
            value: key ? row[key] : undefined,
            format: 'currency',
          },
        ]}
      />
    );
  },
};

export default function VisualRenderer({ visual, dataset }) {
  const layout = useChartLayout();

  if (!visual || !dataset) return null;

  // An unknown chart kind falls back to a table rather than rendering
  // nothing, so a server change can never blank the UI.
  const render = CHART_REGISTRY[visual.chart] || CHART_REGISTRY.table;

  // Charts get one step smaller on mobile; the server's size is the desktop
  // intent.
  const size = layout.isMobile
    ? { lg: 'md', md: 'sm', sm: 'sm' }[visual.size] || 'sm'
    : visual.size || 'md';

  return (
    <section className="insights-visual">
      {visual.title ? (
        <header className="insights-visual-head">
          <h3 className="insights-visual-title">{visual.title}</h3>
          {dataset.row_count ? (
            <span className="insights-visual-meta">
              {dataset.row_count} row{dataset.row_count === 1 ? '' : 's'}
            </span>
          ) : null}
        </header>
      ) : null}

      <ErrorBoundary
        label={`visual ${visual.id}`}
        title="This chart could not be drawn"
        body="The rest of the answer is unaffected."
      >
        {render({ visual, dataset, size, formatInr })}
      </ErrorBoundary>
    </section>
  );
}

export { CHART_REGISTRY };
