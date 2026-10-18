/**
 * Single source of truth for page titles and descriptions.
 *
 * Used by the app header (title/subtitle) and by RouteMeta, which mirrors the
 * title and description into document.title and the <meta> tags.
 *
 * Order matters: the first match wins, so list more specific routes before
 * their parents. Entries with `exact: true` only match the identical path.
 */
const PAGE_META = [
  { prefix: '/', exact: true, title: 'FinTrackr', documentTitle: 'FinTrackr — Personal Finance Tracking', subtitle: '', description: 'FinTrackr helps you capture receipts, categorise spending and visualise where your money goes — with AI-powered expense extraction.' },
  { prefix: '/dashboard', title: 'Dashboard', subtitle: 'Your spending at a glance', description: 'See your spending at a glance with charts, totals and recent expenses.' },
  { prefix: '/report', title: 'Report', subtitle: 'Filter and export your expense history', description: 'Filter, review and export your full expense history.' },
  { prefix: '/add-expense', title: 'Add Expense', subtitle: 'Capture a receipt or enter one manually', description: 'Capture a receipt with AI extraction or enter an expense manually.' },
  { prefix: '/insights', title: 'Insights', subtitle: 'Ask anything about your spending', description: 'Ask questions about your spending and get AI-powered insights.' },
  { prefix: '/settings', title: 'Settings', subtitle: 'Manage your profile and preferences', description: 'Manage your FinTrackr profile, devices and preferences.' },
  { prefix: '/billing', title: 'Plans & Billing', subtitle: 'Choose the plan that fits you', description: 'Compare FinTrackr plans and manage your subscription.' },
  { prefix: '/admin/users', title: 'Admin · Users', subtitle: 'Manage user accounts', description: 'Administer FinTrackr user accounts.' },
  { prefix: '/features', exact: true, title: 'Features', subtitle: '', description: 'Explore FinTrackr features: AI receipt scanning, analytics and smart insights.' },
  { prefix: '/support', exact: true, title: 'Support', subtitle: '', description: 'Get help with FinTrackr — contact our support team.' },
  { prefix: '/login', exact: true, title: 'Sign in', subtitle: '', description: 'Sign in to your FinTrackr account.' },
  { prefix: '/register', exact: true, title: 'Create account', subtitle: '', description: 'Create a free FinTrackr account and start tracking expenses.' },
  { prefix: '/verify-email', exact: true, title: 'Verify email', subtitle: '', description: 'Verify your email address to activate your FinTrackr account.' },
  { prefix: '/forgot-password', exact: true, title: 'Forgot password', subtitle: '', description: 'Request a link to reset your FinTrackr password.' },
  { prefix: '/reset-password', exact: true, title: 'Reset password', subtitle: '', description: 'Choose a new password for your FinTrackr account.' },
];

const FALLBACK = {
  title: 'FinTrackr',
  subtitle: '',
  description: PAGE_META[0].description,
};

export function resolvePageMeta(pathname) {
  const path = pathname || '';
  const match = PAGE_META.find((entry) =>
    entry.exact ? path === entry.prefix : path.startsWith(entry.prefix),
  );
  return match || FALLBACK;
}

export { PAGE_META };
