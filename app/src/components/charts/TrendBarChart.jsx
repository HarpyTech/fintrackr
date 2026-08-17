import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartFrame from './ChartFrame';
import { useChartLayout } from '../../hooks/useChartLayout';
import {
  CHART_ACCENT,
  formatInr,
  formatInrCompact,
  tooltipStyles,
  useChartTheme,
} from '../../lib/chartColors';
import { labelInterval, maxValueOf, niceScale } from '../../lib/chartScale';

/**
 * Single-series bar chart over a time axis.
 *
 * Backs Monthly Trend, Yearly Trend and Daily Expenses — three charts that
 * previously each carried their own copy of the axis setup.
 */
export default function TrendBarChart({
  items,
  xKey,
  valueKey = 'total',
  loading = false,
  error = '',
  color = CHART_ACCENT,
  xLabel = '',
  emptyTitle = 'Nothing to show yet',
  emptyBody = 'Data will appear here once expenses are recorded for this period.',
  size = 'md',
}) {
  const chartTheme = useChartTheme();
  const layout = useChartLayout();

  const rows = Array.isArray(items) ? items : [];

  // Y axis derived from the data rather than left to Recharts, so ticks are
  // round numbers and the top tick sits just above the tallest bar at any
  // magnitude.
  const { domain, ticks } = niceScale(maxValueOf(rows, [valueKey]), {
    targetTicks: layout.targetTicks,
  });

  return (
    <ChartFrame
      loading={loading}
      error={error}
      isEmpty={rows.length === 0}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      size={size}
    >
      <BarChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: xLabel && layout.showAxisLabel ? 16 : 4, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.grid}
          vertical={layout.showGridVertical}
        />
        <XAxis
          dataKey={xKey}
          stroke={chartTheme.axis}
          tick={{ fill: chartTheme.axis, fontSize: layout.tickFontSize }}
          // Thin the labels rather than letting 31 of them overlap at 320px.
          interval={labelInterval(rows.length, layout.maxXLabels)}
          minTickGap={layout.isMobile ? 12 : 5}
          // The axis title collides with the tick row in the reduced mobile
          // height, and the card heading already names the axis.
          label={
            xLabel && layout.showAxisLabel
              ? {
                  value: xLabel,
                  position: 'insideBottom',
                  offset: -6,
                  fill: chartTheme.axis,
                }
              : undefined
          }
        />
        <YAxis
          domain={domain}
          ticks={ticks}
          tickFormatter={formatInrCompact}
          stroke={chartTheme.axis}
          tick={{ fill: chartTheme.axis, fontSize: layout.tickFontSize }}
          width={layout.yAxisWidth}
        />
        <Tooltip
          formatter={(value) => formatInr(value)}
          cursor={{ fill: chartTheme.grid, fillOpacity: 0.35 }}
          {...tooltipStyles(chartTheme)}
        />
        {/* minPointSize keeps a ₹50 bar visible and hoverable next to a
            ₹15,000 one, where it would otherwise render sub-pixel. */}
        <Bar dataKey={valueKey} fill={color} radius={[3, 3, 0, 0]} minPointSize={2} />
      </BarChart>
    </ChartFrame>
  );
}
