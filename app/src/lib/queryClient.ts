import { QueryClient, QueryFunctionContext } from '@tanstack/react-query';
import { apiRequest } from './api';

/**
 * Shared query keys.
 *
 * Centralised so that a mutation can invalidate exactly the right slice.
 * Keys are arrays: ['expenses','summary','daily',{year,month}] lets us
 * invalidate everything under ['expenses'] with one call after an expense is
 * created, without listing each summary individually.
 */
export const queryKeys = {
  expenses: {
    all: ['expenses'] as const,
    // The list endpoint is GET /expenses with no suffix, so this key is just
    // ['expenses'] — defaultQueryFn joins string segments into the path, and
    // an extra 'list' segment would request /expenses/list and 404.
    list: () => ['expenses'] as const,
    limitStatus: () => ['expenses', 'limit-status'] as const,
    summary: {
      all: ['expenses', 'summary'] as const,
      monthly: (year: number) => ['expenses', 'summary', 'monthly', { year }] as const,
      yearly: () => ['expenses', 'summary', 'yearly'] as const,
      categories: (year: number) => ['expenses', 'summary', 'categories', { year }] as const,
      daily: (year: number, month: number) => ['expenses', 'summary', 'daily', { year, month }] as const,
      categoriesMonthly: (year: number, month: number) => [
        'expenses', 'summary', 'categories-monthly', { year, month },
      ] as const,
      vendorsMonthly: (year: number, month: number) => [
        'expenses', 'summary', 'vendors-monthly', { year, month },
      ] as const,
    },
  },
  insights: {
    all: ['insights'] as const,
    overview: () => ['insights', 'overview'] as const,
  },
  user: {
    profile: () => ['user', 'profile'] as const,
  },
};

type QueryKeyPart = string | Record<string, string | number | undefined | null>;

/**
 * Default query function.
 *
 * The queryKey's first string segments form the URL path and any trailing
 * object becomes the query string, so most hooks need no explicit queryFn:
 *
 *   ['expenses','summary','daily',{year:2026,month:8}]
 *     -> GET /expenses/summary/daily?year=2026&month=8
 *
 * Everything still goes through apiRequest, so CSRF injection, the 401
 * session-expiry event and the 429 toast all behave exactly as before.
 */
async function defaultQueryFn({ queryKey, signal }: QueryFunctionContext): Promise<unknown> {
  const segments: string[] = [];
  let params: Record<string, string | number | undefined | null> | null = null;

  for (const part of queryKey as QueryKeyPart[]) {
    if (typeof part === 'string') {
      segments.push(part);
    } else if (part && typeof part === 'object') {
      params = part;
    }
  }

  let path = `/${segments.join('/')}`;

  if (params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.append(key, String(value));
      }
    });
    const queryString = search.toString();
    if (queryString) {
      path += `?${queryString}`;
    }
  }

  return apiRequest(path, { signal });
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: defaultQueryFn,

        // Expense data changes only when the user adds an expense, and that
        // path invalidates explicitly. A minute of staleness removes the
        // duplicate fetches that happened on every mount and filter change.
        staleTime: 60_000,
        gcTime: 5 * 60_000,

        // The dashboard used to refetch all summaries whenever the tab
        // regained focus. Cached data plus explicit invalidation is enough.
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: true,

        // A 401 is terminal — apiRequest has already raised the
        // session-expiry event and the user is being redirected. A 4xx will
        // not fix itself either, so only retry transient failures.
        retry: (failureCount: number, error: unknown) => {
          const status = (error as { status?: number } | null)?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
