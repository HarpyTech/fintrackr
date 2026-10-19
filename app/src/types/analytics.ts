// Mirrors the "answer" envelope built by run_analytics_agent() in
// app/services/analytics_agent_service.py — keep in sync with the backend.

export type AnalyticsStatus = 'ok' | 'partial' | 'refused';
export type AnalyticsConfidenceLevel = 'low' | 'medium' | 'high';
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

export interface AnalyticsQueryView {
  op: 'find' | 'aggregate';
  collection?: string;
  pipeline?: unknown[] | null;
  filter?: Record<string, unknown> | null;
  projection?: Record<string, unknown> | null;
  explain?: string;
  executed_ms?: number;
  row_count?: number;
  repaired?: boolean;
}

export interface AnalyticsConfidence {
  score: number;
  level: AnalyticsConfidenceLevel;
  caveats: string[];
}

export interface AnalyticsMeta {
  llm_calls?: number;
  latency_ms?: number;
  model?: string;
  generated_at?: string;
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
  query?: AnalyticsQueryView;
  confidence?: AnalyticsConfidence;
  followups: string[];
  degraded?: boolean;
  error?: { reason: string };
  meta?: AnalyticsMeta;
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
