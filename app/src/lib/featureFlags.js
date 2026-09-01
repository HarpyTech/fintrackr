import { useAuth } from '../auth/AuthContext';

function parseBooleanFlag(value, defaultValue = false) {
  if (value == null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

export const isSupportPageEnabled = parseBooleanFlag(
  import.meta.env.VITE_FEATURE_SUPPORT_PAGE_ENABLED,
  false
);

export function usePlan() {
  const { profile } = useAuth();
  const plan = profile?.plan || 'free';
  const expenseLimit = profile?.expense_limit ?? 15;
  return {
    plan,
    expenseLimit,
    isFree: plan === 'free',
    isGo: plan === 'go',
    isMax: plan === 'max',
  };
}
