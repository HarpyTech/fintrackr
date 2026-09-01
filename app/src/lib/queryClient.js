import { QueryClient } from '@tanstack/react-query';
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
    all: ['expenses'],
    // The list endpoint is GET /expenses with no suffix, so this key is just
    // ['expenses'] — defaultQueryFn joins string segments into the path, and
    // an extra 'list' segment would request /expenses/list and 404.
    list: () => ['expenses'],
    limitStatus: () => ['expenses', 'limit-status'],
    summary: {
      all: ['expenses', 'summary'],
      monthly: (year) => ['expenses', 'summary', 'monthly', { year }],
      yearly: () => ['expenses', 'summary', 'yearly'],
      categories: (year) => ['expenses', 'summary', 'categories', { year }],
      daily: (year, month) => ['expenses', 'summary', 'daily', { year, month }],
      categoriesMonthly: (year, month) => [
        'expenses', 'summary', 'categories-monthly', { year, month },
      ],
      vendorsMonthly: (year, month) => [
        'expenses', 'summary', 'vendors-monthly', { year, month },
      ],
    },
  },
  insights: {
    all: ['insights'],
    overview: () => ['insights', 'overview'],
  },
  user: {
    profile: () => ['user', 'profile'],
  },
};

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
async function defaultQueryFn({ queryKey, signal }) {
  const segments = [];
  let params = null;

  for (const part of queryKey) {
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

export function createQueryClient() {
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
        retry: (failureCount, error) => {
          const status = error?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
