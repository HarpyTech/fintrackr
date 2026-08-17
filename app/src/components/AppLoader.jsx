/**
 * Branded loading state.
 *
 * Used for the session bootstrap and for lazy route chunks. Replaces the
 * bare "Loading session..." paragraph, which was the first thing a returning
 * user saw on every protected route.
 */
export default function AppLoader({ label = 'Loading…', full = false }) {
  return (
    <div className={`app-loader${full ? ' app-loader-full' : ''}`} role="status" aria-live="polite">
      <span className="app-loader-spinner" aria-hidden="true" />
      <p className="app-loader-text">{label}</p>
    </div>
  );
}
