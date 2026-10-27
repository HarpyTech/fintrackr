/**
 * The user's timezone: their saved profile choice, else the browser's zone.
 * Sent on every API call as X-Timezone so the server's "today" (current
 * month, "this week", default expense date) matches the user's calendar.
 */

let preferredTimezone: string | null = null;

/** Called by AuthContext when the profile loads, changes, or the user signs out. */
export function setPreferredTimezone(timeZone: string | null | undefined): void {
  preferredTimezone = timeZone || null;
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getUserTimezone(): string {
  return preferredTimezone || browserTimezone();
}

/** Today's date as YYYY-MM-DD in *timeZone* (not UTC, unlike toISOString). */
export function todayIso(timeZone: string = getUserTimezone()): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', options).format(new Date());
  }
}

/** All IANA zones the browser knows, for the Settings picker. */
export function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.('timeZone') ?? [];
  const current = browserTimezone();
  return zones.includes(current) ? zones : [current, ...zones];
}
