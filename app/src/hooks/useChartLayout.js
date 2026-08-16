import { useEffect, useMemo, useState } from 'react';

/**
 * The mobile breakpoint. Must stay identical to the `max-width: 767px` used
 * throughout app/src/styles/responsive.css — if the two drift, the chart's
 * JS-side sizing and its CSS container disagree and charts clip.
 */
const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Subscribe to a media query.
 *
 * Mirrors the matchMedia pattern already used in theme/ThemeContext.jsx and
 * pwa/PwaContext.jsx, including the addListener fallback for Safari < 14.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);

    // Re-sync on mount: the query may have changed between the initial state
    // computation and the effect firing.
    setMatches(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}

const MOBILE_LAYOUT = {
  isMobile: true,
  targetTicks: 4,
  yAxisWidth: 44,
  maxXLabels: 6,
  donutLimit: 5,
  seriesLimit: 3,
  tickFontSize: 10,
  legendFontSize: 10,
  donutRadii: { inner: 44, outer: 68 },
  // Minimum horizontal room a single month group needs before grouped bars
  // become too thin to read. Drives ChartFrame's scrollable track.
  groupMinWidth: 46,
  showAxisLabel: false,
  showGridVertical: false,
};

const DESKTOP_LAYOUT = {
  isMobile: false,
  targetTicks: 6,
  yAxisWidth: 64,
  maxXLabels: 12,
  donutLimit: 7,
  seriesLimit: 6,
  tickFontSize: 12,
  legendFontSize: 12,
  donutRadii: { inner: 60, outer: 90 },
  groupMinWidth: 0,
  showAxisLabel: true,
  showGridVertical: true,
};

/**
 * Single source of truth for every breakpoint-dependent chart number.
 *
 * Charts read their sizing from here rather than hard-coding values, so a
 * tuning change lands in one place and new charts inherit correct behaviour.
 */
export function useChartLayout() {
  const isMobile = useIsMobile();
  return useMemo(() => (isMobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT), [isMobile]);
}

export default useChartLayout;
