import { Link } from 'react-router-dom';
import InstallAppButton from '../components/InstallAppButton';

const highlights = [
  {
    icon: 'AI',
    title: 'AI-Powered Insights',
    text: 'Automatically extract expense details from receipts and get intelligent spending recommendations.',
  },
  {
    icon: 'AN',
    title: 'Visual Analytics',
    text: 'Beautiful charts and reports that make it easy to understand your spending patterns at a glance.',
  },
  {
    icon: 'RT',
    title: 'Real-Time Tracking',
    text: 'Capture expenses on the go with our mobile-friendly interface and instant updates.',
  },
];

const outcomes = [
  'Reduce manual data entry with AI-assisted expense extraction',
  'Gain clear visibility into spending patterns across categories and vendors',
  'Build better financial habits with data-driven insights',
  'Access your financial data anytime, anywhere',
];

export default function LandingPage() {
  return (
    <main className="landing-layout">
      <section className="landing-hero">
        <div className="landing-badge">
          <span className="landing-badge-icon" aria-hidden="true">✦</span>
          Financial Clarity Made Simple
        </div>
        <div className="landing-brand-row">
          <img
            src="/assets/app_logo.png"
            alt="FinTrackr icon"
            className="landing-brand-icon"
          />
          <img
            src="/assets/name_logo.svg"
            alt="FinTrackr"
            className="landing-brand-name"
          />
        </div>
        <h1>Take Control of Your Expenses</h1>
        <p>
          Smart expense tracking with AI-powered receipt scanning, real-time analytics,
          and insights that help you make better financial decisions.
        </p>
        <div className="landing-cta-row">
          <Link to="/features" className="landing-secondary-cta">See How It Works</Link>
          <Link to="/register" className="landing-primary-cta">Get Started Free</Link>
          <Link to="/login" className="landing-tertiary-cta">Sign In</Link>
        </div>
        <div className="landing-install-row">
          <InstallAppButton variant="hero" />
        </div>
      </section>

      <section id="landing-benefits" className="landing-section">
        <h2>Why Choose FinTrackr?</h2>
        <div className="landing-cards">
          {highlights.map((item) => (
            <article key={item.title} className="landing-card">
              <div className="landing-card-icon" aria-hidden="true">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-outcomes">
        <h2>What You'll Achieve</h2>
        <ul>
          {outcomes.map((item) => (
            <li key={item}>
              <span className="landing-check" aria-hidden="true">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section landing-bottom-cta">
        <h2>Ready to Take Control?</h2>
        <p>
          Join users transforming how they track and understand money with FinTrackr.
        </p>
        <Link to="/register" className="landing-primary-cta">Create Free Account</Link>
      </section>
    </main>
  );
}
