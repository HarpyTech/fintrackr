function parseBooleanFlag(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

export const isSupportPageEnabled: boolean = parseBooleanFlag(
  import.meta.env.VITE_FEATURE_SUPPORT_PAGE_ENABLED,
  false,
);
