/**
 * Display name and initials for the signed-in user.
 *
 * These two functions were previously duplicated verbatim as ~18-line
 * useMemo blocks in both TopNavigation.jsx and MobileHeader.jsx. Extracted so
 * the avatar reads the same everywhere.
 */

export function resolveDisplayName(profile, sessionUser) {
  const firstName = profile?.first_name?.trim();
  const lastName = profile?.last_name?.trim();

  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ');
  }
  return sessionUser || 'User';
}

export function resolveInitials(profile, sessionUser) {
  const firstName = profile?.first_name?.trim();
  const lastName = profile?.last_name?.trim();

  if (firstName && lastName) {
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
  }

  if (firstName) {
    const fallback = sessionUser || '';
    return (
      (firstName.charAt(0) + fallback.charAt(0))
        .replace(/\s/g, '')
        .toUpperCase()
        .slice(0, 2) || 'U'
    );
  }

  const candidate = (sessionUser || '').trim();

  // Email addresses give better initials from the local part than from the
  // raw string, which may start with a digit or symbol.
  if (candidate.includes('@')) {
    const localPart = candidate.split('@')[0] || '';
    const letters = localPart.replace(/[^a-zA-Z]/g, '');
    return letters.slice(0, 2).toUpperCase() || 'U';
  }

  return candidate.slice(0, 2).toUpperCase() || 'U';
}
