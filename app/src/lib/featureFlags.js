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
