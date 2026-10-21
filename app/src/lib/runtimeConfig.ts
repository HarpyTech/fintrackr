export interface AppRuntimeConfig {
  featureSupportPageEnabled: boolean;
  featureBillingEnabled: boolean;
  featureAdminEnabled: boolean;
  supportEmail: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppRuntimeConfig>;
  }
}

// Defaults mirror app/core/config.py; used when /runtime-config.js fails to load.
const DEFAULTS: AppRuntimeConfig = {
  featureSupportPageEnabled: true,
  featureBillingEnabled: false,
  featureAdminEnabled: false,
  supportEmail: '',
};

export const runtimeConfig: AppRuntimeConfig = {
  ...DEFAULTS,
  ...(typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined),
};
