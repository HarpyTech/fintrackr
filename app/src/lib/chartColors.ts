import { useEffect, useState } from 'react';

export const CHART_COLORS: string[] = [
  '#3d6fd6', // blue    — anchors the palette to the --brand family
  '#e0701f', // orange
  '#0f9488', // teal
  '#d6455f', // rose
  '#8b5cf6', // purple
  '#3f9e52', // green
  '#b8860b', // gold    — replaces the inaccessible #ffeb3b
  '#64748b', // slate
];

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

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
