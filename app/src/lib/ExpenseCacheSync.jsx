import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryClient';

/**
 * Bridges the app's existing `expense:created` window event into React Query
 * cache invalidation.
 *
 * Before this, AddExpensePage / ExpenseChatWidget dispatched the event and
 * DashboardPage listened for it, then re-ran both of its loader functions by
 * hand — eight requests, whether or not the data had changed. Now one
 * invalidation marks everything under ['expenses'] stale and only the queries
 * actually mounted refetch.
 *
 * Renders nothing; it exists purely for the subscription.
 */
export function ExpenseCacheSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleExpenseCreated() {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      // Insight figures are derived from expenses, so they go stale too.
      queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });
    }

    window.addEventListener('expense:created', handleExpenseCreated);
    return () => {
      window.removeEventListener('expense:created', handleExpenseCreated);
    };
  }, [queryClient]);

  return null;
}

export default ExpenseCacheSync;
