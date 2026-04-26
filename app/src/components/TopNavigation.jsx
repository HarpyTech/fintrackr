export default function TopNavigation({ title }) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-title">
        <img src="/assets/name_logo.svg" alt="FinTrackr" className="dashboard-logo" />
        <span>{title}</span>
      </div>
    </header>
  );
}
