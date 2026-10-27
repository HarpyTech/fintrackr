import { useEffect, useState } from 'react';

/**
 * Shared categorical palette for all charts.
 *
 * Previously each chart file declared its own copy of this array, and that
 * palette included #ffeb3b (bright yellow) which fell below the 3:1 contrast
 * floor for graphical objects (WCAG 2.1 SC 1.4.11) against the white surface.
 *
 * Every colour below sits in the mid-lightness band so it clears 3:1 against
 * BOTH the light surface (#ffffff) and the dark surface (#121a2b). The order
 * is deliberate: adjacent entries are far apart in hue so neighbouring donut
 * segments and stacked bars stay distinguishable.
 *
 * Colours are read from CSS custom properties (falling back to the hardcoded
 * hex values) so a theme change picks them up without a reload.
 */
function readCssVar(name: string): string | null {
  if (typeof document === 'undefined') return null;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || null;
}

function buildPalette(): string[] {
  return [
    readCssVar('--chart-1') || '#3d6fd6',
    readCssVar('--chart-2') || '#e0701f',
    readCssVar('--chart-3') || '#0f9488',
    readCssVar('--chart-4') || '#d6455f',
    readCssVar('--chart-5') || '#8b5cf6',
    readCssVar('--chart-6') || '#3f9e52',
    readCssVar('--chart-7') || '#b8860b',
    readCssVar('--chart-8') || '#64748b',
  ];
}

export function getChartColors(): string[] {
  return buildPalette();
}

// Static export for non-reactive usage (SSR / initial render before DOM is ready)
export const CHART_COLORS: string[] = buildPalette();

/** Pick a palette colour by index, wrapping around. */
export function chartColor(index: number): string {
  return buildPalette()[index % 8];
}

/** Single-series accent, used where only one colour is needed. */
export const CHART_ACCENT: string = CHART_COLORS[0];
export const CHART_ACCENT_ALT: string = CHART_COLORS[5];

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function formatInr(value: number | string): string {
  return inrFormatter.format(Number(value || 0));
}

export function formatInrCompact(value: number | string): string {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);

  if (abs >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

interface ChartTheme {
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

const CHART_THEMES: Record<'light' | 'dark', ChartTheme> = {
  light: {
    axis: '#516079',
    grid: '#dbe2f0',
    tooltipBg: '#ffffff',
    tooltipBorder: '#c8d2e4',
    tooltipText: '#12213d',
  },
  dark: {
    axis: '#a8b6cf',
    grid: '#29354c',
    tooltipBg: '#172134',
    tooltipBorder: '#34445f',
    tooltipText: '#edf4ff',
  },
};

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);

  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(target, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return CHART_THEMES[theme];
}

export function tooltipStyles(chartTheme: ChartTheme): Record<string, Record<string, string>> {
  return {
    contentStyle: {
      background: chartTheme.tooltipBg,
      border: `1px solid ${chartTheme.tooltipBorder}`,
      borderRadius: '10px',
      color: chartTheme.tooltipText,
    },
    labelStyle: { color: chartTheme.tooltipText },
    itemStyle: { color: chartTheme.tooltipText },
  };
}
