import { useAuth } from '../auth/AuthContext';

function parseBooleanFlag(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

export const isSupportPageEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_FEATURE_SUPPORT_PAGE_ENABLED,
  true,
);

export const isBillingEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_FEATURE_BILLING_ENABLED,
  false,
);

export const isAdminEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_FEATURE_ADMIN_ENABLED,
  false,
);

export interface PlanInfo {
  plan: string;
  expenseLimit: number;
  isFree: boolean;
  isGo: boolean;
  isMax: boolean;
}

export function usePlan(): PlanInfo {
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
