import { useAuth } from '../auth/AuthContext';
import { runtimeConfig } from './runtimeConfig';

export const isSupportPageEnabled: boolean = runtimeConfig.featureSupportPageEnabled;
export const isBillingEnabled: boolean = runtimeConfig.featureBillingEnabled;
export const isAdminEnabled: boolean = runtimeConfig.featureAdminEnabled;
export const isGoogleSigninEnabled: boolean = runtimeConfig.featureGoogleSigninEnabled;

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
