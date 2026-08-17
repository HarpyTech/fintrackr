import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartFrame from './ChartFrame';
import { useChartLayout } from '../../hooks/useChartLayout';
import {
  CHART_COLORS,
  chartColor,
  formatInr,
  formatInrCompact,
  tooltipStyles,
  useChartTheme,
} from '../../lib/chartColors';
import {
  labelInterval,
  maxValueOf,
  niceScale,
  rankSeriesKeys,
  truncateLabel,
} from '../../lib/chartScale';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OTHER_KEY = 'Other';
const OTHER_COLOR = CHART_COLORS[CHART_COLORS.length - 1]; // slate

/**
 * Pivot flat {category, month, total} rows into one row per month, with a
 * column per category.
 *
 * `keepKeys` is the ranked shortlist; every category outside it is summed
 * into a single `Other` column so the series count stays bounded no matter
 * how many category names the extraction step invents.
 */
function pivot(items, keepKeys) {
  if (!items?.length) return [];

  const keep = new Set(keepKeys);
  const monthMap = {};

  for (const item of items) {
    const abbr = MONTH_ABBR[(item.month || 1) - 1];
    if (!abbr) continue;

    if (!monthMap[abbr]) monthMap[abbr] = { month: abbr };

    const column = keep.has(item.category) ? item.category : OTHER_KEY;
    monthMap[abbr][column] = (monthMap[abbr][column] || 0) + Number(item.total || 0);
  }

  return MONTH_ABBR.filter((abbr) => monthMap[abbr]).map((abbr) => monthMap[abbr]);
}

/**
 * Grouped bar chart of spend per category across the months of a year.
 *
 * Categories are free-text, so the raw series count is unbounded — previously
 * one <Bar> was rendered per distinct category per month, which at realistic
 * cardinality produced hundreds of sub-pixel bars.
 *
 * Series are capped to the top N by annual total plus an "Other" column.
 * Ranking by total (rather than by row insertion order) also keeps each
 * category on the same colour when the month filter changes.
 */
export default function CategoryTrendChart({
  items,
  loading = false,
  error = '',
  emptyTitle = 'Nothing to compare yet',
  emptyBody = 'Add expenses across a few months to see how each category averages out.',
  size = 'lg',
}) {
  const chartTheme = useChartTheme();
  const layout = useChartLayout();

  const rows = Array.isArray(items) ? items : [];
  const allCategories = Array.from(new Set(rows.map((item) => item.category)));

  // Rank against a full pivot so the shortlist reflects annual totals rather
  // than whichever categories happen to appear first.
  const fullPivot = pivot(rows, allCategories);
  const { keys: topKeys, overflow } = rankSeriesKeys(
    fullPivot,
    allCategories,
    layout.seriesLimit,
  );

  const data = overflow.length > 0 ? pivot(rows, topKeys) : fullPivot;
  const seriesKeys = overflow.length > 0 ? [...topKeys, OTHER_KEY] : topKeys;

  const { domain, ticks } = niceScale(maxValueOf(data, seriesKeys), {
    targetTicks: layout.targetTicks,
  });

  // Grouped bars were kept over stacked, so on narrow screens the chart is
  // scrolled rather than compressed — 12 month groups × N series below a
  // minimum width per group is unreadable.
  const scrollMinWidth = layout.groupMinWidth
    ? Math.max(0, data.length * seriesKeys.length * layout.groupMinWidth)
    : 0;

  return (
    <ChartFrame
      loading={loading}
      error={error}
      isEmpty={data.length === 0}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      size={size}
      scrollMinWidth={scrollMinWidth}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTheme.grid}
          vertical={layout.showGridVertical}
        />
        <XAxis
          dataKey="month"
          stroke={chartTheme.axis}
          tick={{ fill: chartTheme.axis, fontSize: layout.tickFontSize }}
          interval={scrollMinWidth ? 0 : labelInterval(data.length, layout.maxXLabels)}
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
          formatter={(value, name) => [formatInr(value), name]}
          cursor={{ fill: chartTheme.grid, fillOpacity: 0.35 }}
          {...tooltipStyles(chartTheme)}
        />
        <Legend
          wrapperStyle={{ color: chartTheme.axis, fontSize: layout.legendFontSize }}
          formatter={(value) => truncateLabel(value, layout.isMobile ? 10 : 18)}
        />
        {seriesKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            fill={key === OTHER_KEY ? OTHER_COLOR : chartColor(index)}
            radius={[3, 3, 0, 0]}
            minPointSize={2}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}
