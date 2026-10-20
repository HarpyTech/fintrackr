// Mirrors the public answer envelope returned by POST /insights/ask.
// Internal fields (confidence, query, degraded, meta, error) are stripped
// server-side and must not be used in client code.

export type AnalyticsStatus = 'ok' | 'empty' | 'error';
export type AnalyticsFormat = 'currency' | 'number' | 'percent' | 'string';
export type AgentPhase =
  | ''
  | 'queued'
  | 'context'
  | 'planning'
  | 'validating'
  | 'executing'
  | 'charting'
  | 'fallback';

export interface AnalyticsHighlight {
  label: string;
  value: number | string | null | undefined;
  format?: AnalyticsFormat;
  delta_pct?: number | null;
  direction?: 'up' | 'down' | 'flat';
}

export interface AnalyticsNarrative {
  headline: string;
  body_md?: string;
  highlights: AnalyticsHighlight[];
}

export interface AnalyticsColumn {
  key: string;
  label: string;
  type?: AnalyticsFormat;
}

export interface AnalyticsDatasetRow {
  [column: string]: string | number | null | undefined;
}

export interface AnalyticsDataset {
  id: string;
  title?: string;
  rows: AnalyticsDatasetRow[];
  columns?: AnalyticsColumn[];
  row_count?: number;
  truncated?: boolean;
}

export interface AnalyticsVisualEncoding {
  x?: string;
  value?: string;
  name?: string;
  x_label?: string;
}

export interface AnalyticsVisual {
  id: string;
  chart: 'trend_bar' | 'breakdown' | 'category_trend' | 'table' | 'kpi' | string;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  dataset_id: string;
  encoding?: AnalyticsVisualEncoding;
}

/** One complete agent answer, as returned by POST /insights/ask (and the SSE `done` event). */
export interface AnalyticsAnswer {
  answer_id: string;
  question: string;
  session_id?: string;
  status: AnalyticsStatus;
  narrative?: AnalyticsNarrative;
  datasets: AnalyticsDataset[];
  visuals: AnalyticsVisual[];
}

export interface AnalyticsHistoryResponse {
  items: AnalyticsAnswer[];
}

export interface InsightsOverviewTopCategory {
  name: string;
  total: number;
}

/** KPI strip on the Insights page, from GET /insights/overview. */
export interface InsightsOverview {
  total_spend: number;
  total_transactions: number;
  this_month: number;
  this_month_transactions: number;
  last_month: number;
  month_delta_pct: number | null;
  active_categories: number;
  top_category: InsightsOverviewTopCategory | null;
}
