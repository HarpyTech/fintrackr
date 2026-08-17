import { ResponsiveContainer } from 'recharts';
import EmptyState from '../EmptyState';

/**
 * Sizing and state wrapper shared by every chart.
 *
 * Two jobs:
 *
 * 1. Owns the loading / error / empty / chart branching that was previously
 *    duplicated in each chart component.
 *
 * 2. Owns the height. The container gets its height from CSS
 *    (`.chart-frame-{size}`) and the ResponsiveContainer inside is always
 *    100% of it. Previously each chart passed a fixed pixel height while the
 *    surrounding `.chart-box` was styled to a different height per
 *    breakpoint — a 260px chart inside a 200px box clipped on mobile. Because
 *    no caller can pass a pixel height any more, that class of bug cannot
 *    recur.
 *
 * `scrollMinWidth` puts the chart on a horizontally scrollable track. Used by
 * grouped multi-series charts, where beyond a certain series count the bars
 * are better scrolled than shrunk into invisibility.
 */
export default function ChartFrame({
  loading = false,
  error = '',
  isEmpty = false,
  emptyTitle,
  emptyBody,
  size = 'md',
  scrollMinWidth = 0,
  children,
}) {
  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (loading) {
    return (
      <div className={`chart-frame chart-frame-${size}`}>
        <div className="skeleton skeleton-chart" aria-hidden="true" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState title={emptyTitle} body={emptyBody} compact />
    );
  }

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );

  if (scrollMinWidth > 0) {
    return (
      <div className="chart-scroll">
        <div
          className={`chart-frame chart-frame-${size}`}
          style={{ minWidth: `${scrollMinWidth}px` }}
        >
          {chart}
        </div>
      </div>
    );
  }

  return <div className={`chart-frame chart-frame-${size}`}>{chart}</div>;
}
