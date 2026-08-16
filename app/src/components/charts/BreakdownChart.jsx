import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import ChartFrame from './ChartFrame';
import { useChartLayout } from '../../hooks/useChartLayout';
import {
  CHART_COLORS,
  chartColor,
  formatInr,
  tooltipStyles,
  useChartTheme,
} from '../../lib/chartColors';
import { topNWithOther, truncateLabel } from '../../lib/chartScale';

/** Reserved for the "Other" bucket so it never impersonates a real slice. */
const OTHER_COLOR = CHART_COLORS[CHART_COLORS.length - 1]; // slate

/**
 * Donut breakdown of a categorical dimension.
 *
 * Backs Category Split, Expenses by Category and Expenses by Vendor.
 *
 * `category` and `vendor` are free-text with no server-side cap, so the raw
 * series is unbounded — a user with 40 distinct vendors previously got 40
 * slices and a legend four rows deep. The series is capped here and the tail
 * folded into a single "Other" slice.
 */
export default function BreakdownChart({
  items,
  nameKey,
  valueKey = 'total',
  loading = false,
  error = '',
  unknownLabel = 'Unknown',
  emptyTitle = 'Nothing to show yet',
  emptyBody = 'This breakdown appears once expenses are recorded for the period.',
  size = 'md',
}) {
  const chartTheme = useChartTheme();
  const layout = useChartLayout();

  const rows = Array.isArray(items) ? items : [];

  // Blank vendor names come back as '' from the API; label them before
  // bucketing so an unnamed vendor is distinguishable from the Other bucket.
  const normalized = rows.map((row) => ({
    ...row,
    [nameKey]: row?.[nameKey] === '' || row?.[nameKey] == null
      ? unknownLabel
      : row[nameKey],
  }));

  const { data, otherCount } = topNWithOther(normalized, {
    nameKey,
    valueKey,
    limit: layout.donutLimit,
  });

  const grandTotal = data.reduce((sum, row) => sum + Number(row?.[valueKey] || 0), 0);

  return (
    <ChartFrame
      loading={loading}
      error={error}
      isEmpty={data.length === 0}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      size={size}
    >
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius={layout.donutRadii.inner}
          outerRadius={layout.donutRadii.outer}
          paddingAngle={1}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${entry[nameKey]}-${index}`}
              fill={entry.__isOther ? OTHER_COLOR : chartColor(index)}
            />
          ))}
        </Pie>
        <Legend
          wrapperStyle={{ color: chartTheme.axis, fontSize: layout.legendFontSize }}
          formatter={(value, entry) =>
            entry?.payload?.__isOther && otherCount
              ? `Other (${otherCount})`
              : truncateLabel(value, layout.isMobile ? 12 : 18)
          }
        />
        <Tooltip
          formatter={(value, name, entry) => {
            const share = grandTotal > 0 ? (Number(value) / grandTotal) * 100 : 0;
            const label = entry?.payload?.__isOther
              ? `Other (${otherCount} items)`
              : name;
            return [`${formatInr(value)} · ${share.toFixed(1)}%`, label];
          }}
          {...tooltipStyles(chartTheme)}
        />
      </PieChart>
    </ChartFrame>
  );
}
