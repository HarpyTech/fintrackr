/**
 * Single source of truth for page titles.
 *
 * Previously the same title was declared in three places — `TopNavigation
 * title="…"` on each page, an in-page `<h1>`, and a private PAGE_TITLES map
 * inside MobileHeader — and they had drifted apart: Reports/Report, and
 * Insights/"Personalized Insights". Anything that needs a page title now
 * reads it from here.
 *
 * Order matters: the first prefix match wins, so list more specific routes
 * before their parents.
 */
const PAGE_META = [
  {
    prefix: '/dashboard',
    title: 'Dashboard',
    subtitle: 'Your spending at a glance',
  },
  {
    prefix: '/report',
    title: 'Report',
    subtitle: 'Filter and export your expense history',
  },
  {
    prefix: '/add-expense',
    title: 'Add Expense',
    subtitle: 'Capture a receipt or enter one manually',
  },
  {
    prefix: '/insights',
    title: 'Insights',
    subtitle: 'Ask anything about your spending',
  },
  {
    prefix: '/settings',
    title: 'Settings',
    subtitle: 'Manage your profile and preferences',
  },
];

const FALLBACK = { title: 'FinTrackr', subtitle: '' };

export function resolvePageMeta(pathname) {
  const match = PAGE_META.find((entry) => (pathname || '').startsWith(entry.prefix));
  return match || FALLBACK;
}

export { PAGE_META };
