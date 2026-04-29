import { Link } from 'react-router-dom';
import {
  Camera,
  TrendingUp,
  MessageCircle,
  BarChart3,
  Zap,
  Shield,
  Smartphone,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

const WORKFLOWS = [
  {
    step: 1,
    title: 'Capture Your Receipt',
    description: 'Simply snap a photo of your receipt using your phone camera or upload an image',
    color: 'blue',
    Icon: Camera,
    imageSrc: '/assets/Capture_Recipt.png',
    imageAlt: 'Receipt capture workflow preview',
    details: ['Works with any receipt format', 'Mobile-friendly camera capture', 'Drag & drop file upload'],
  },
  {
    step: 2,
    title: 'AI Extracts Data',
    description: 'Our AI automatically reads and extracts all expense details in seconds',
    color: 'purple',
    Icon: Zap,
    imageSrc: '/assets/Extract_Recipt_Info.png',
    imageAlt: 'AI extraction workflow preview',
    details: ['Vendor name detection', 'Line-item extraction', 'Date and amount parsing'],
  },
  {
    step: 3,
    title: 'Review & Save',
    description: 'Quickly review the extracted data and save to your expense tracker',
    color: 'green',
    Icon: CheckCircle,
    imageSrc: '/assets/Save_Recipt.png',
    imageAlt: 'Save receipt workflow preview',
    details: ['Auto-categorization', 'Edit if needed', 'One-click save'],
  },
  {
    step: 4,
    title: 'Instant Insights',
    description: 'View real-time analytics, trends, and personalized spending insights',
    color: 'indigo',
    Icon: BarChart3,
    imageSrc: '/assets/View_Insights.png',
    imageAlt: 'Insights dashboard workflow preview',
    details: ['Visual dashboards', 'Category breakdowns', 'Monthly trends'],
  },
];

const FEATURES = [
  { Icon: Camera, title: 'Smart Receipt Scanning', description: 'AI-powered OCR technology extracts data from receipts instantly', colorClass: 'features-proto-icon-blue' },
  { Icon: MessageCircle, title: 'Chat Assistant', description: 'Ask questions about your spending in plain English', colorClass: 'features-proto-icon-purple' },
  { Icon: BarChart3, title: 'Visual Analytics', description: 'Beautiful charts and graphs to understand your finances', colorClass: 'features-proto-icon-green' },
  { Icon: TrendingUp, title: 'Trend Analysis', description: 'Track spending patterns over time with smart insights', colorClass: 'features-proto-icon-orange' },
  { Icon: Shield, title: 'Secure & Private', description: 'Your financial data is encrypted and protected', colorClass: 'features-proto-icon-red' },
  { Icon: Smartphone, title: 'Mobile Optimized', description: 'Works seamlessly on desktop, tablet, and mobile', colorClass: 'features-proto-icon-indigo' },
];

const STORY_ITEMS = [
  { emoji: '☕', time: 'Morning: Coffee Run', detail: 'Snap receipt, AI logs $4.50 to "Food" category. Done in 3 seconds.' },
  { emoji: '🚗', time: 'Lunch: Uber to Restaurant', detail: 'Open app, type "Uber $12", automatically categorized as Transport.' },
  { emoji: '💬', time: 'Evening: Check Spending', detail: 'Ask chat: "How much did I spend on food this week?" Get instant answer.' },
  { emoji: '📊', time: 'Night: Review Dashboard', detail: 'View monthly trends, spot patterns, adjust budget for next month.' },
];

export default function FeaturesPage() {
  return (
    <div className="features-proto">
      {/* Header */}
      <header className="features-proto-header">
        <div className="features-proto-header-inner">
          <Link to="/" className="features-proto-brand">
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="features-proto-brand-logo" />
          </Link>
          <Link to="/login" className="features-proto-signin">Sign In</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="features-proto-hero">
        <div className="features-proto-hero-badge">
          <Zap className="features-proto-hero-badge-icon" />
          <span>See How Easy Expense Tracking Can Be</span>
        </div>
        <h1 className="features-proto-hero-title">Track Expenses in 4 Simple Steps</h1>
        <p className="features-proto-hero-sub">
          No more manual data entry. No more lost receipts. Just snap, review, and understand your spending.
        </p>
      </section>

      {/* Workflow Steps */}
      <section className="features-proto-steps-section">
        <div className="features-proto-container features-proto-steps">
          {WORKFLOWS.map((wf, idx) => (
            <div key={wf.step} className={`features-proto-step${idx % 2 !== 0 ? ' reversed' : ''}`}>
              <div className="features-proto-step-content">
                <div className="features-proto-step-meta">
                  <div className={`features-proto-step-icon features-proto-step-icon-${wf.color}`}>
                    <wf.Icon size={20} />
                  </div>
                  <span className={`features-proto-step-tag features-proto-step-tag-${wf.color}`}>
                    STEP {wf.step}
                  </span>
                </div>
                <h3 className="features-proto-step-title">{wf.title}</h3>
                <p className="features-proto-step-desc">{wf.description}</p>
                <ul className="features-proto-step-check-list">
                  {wf.details.map((d, i) => (
                    <li key={i} className="features-proto-step-check-item">
                      <span className={`features-proto-check-dot features-proto-check-dot-${wf.color}`}>✓</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="features-proto-step-visual">
                <div className="features-proto-step-card">
                  <div className="features-proto-step-image-wrap">
                    <img src={wf.imageSrc} alt={wf.imageAlt} className="features-proto-step-image" loading="lazy" />
                  </div>
                  <span className="features-proto-step-card-label">Interactive Demo</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-proto-feat-section">
        <div className="features-proto-container">
          <h2 className="features-proto-feat-title">Everything You Need</h2>
          <p className="features-proto-feat-sub">Powerful features designed to make expense tracking effortless</p>
          <div className="features-proto-feat-grid">
            {FEATURES.map((feat, idx) => (
              <div key={idx} className="features-proto-feat-card">
                <div className={`features-proto-feat-icon ${feat.colorClass}`}>
                  <feat.Icon size={24} />
                </div>
                <h4 className="features-proto-feat-card-title">{feat.title}</h4>
                <p className="features-proto-feat-card-desc">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* A Day in Your Life Story */}
      <section className="features-proto-story-section">
        <div className="features-proto-container">
          <div className="features-proto-story">
            <h3 className="features-proto-story-title">A Day in Your Life with FinTrackr</h3>
            <div className="features-proto-story-items">
              {STORY_ITEMS.map((item, idx) => (
                <div key={idx} className="features-proto-story-item">
                  <div className="features-proto-story-emoji">{item.emoji}</div>
                  <div>
                    <p className="features-proto-story-time">{item.time}</p>
                    <p className="features-proto-story-detail">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="features-proto-cta-section">
        <div className="features-proto-container features-proto-cta">
          <h2 className="features-proto-cta-title">Ready to Take Control of Your Finances?</h2>
          <p className="features-proto-cta-sub">
            Join thousands of users who have simplified their expense tracking
          </p>
          <div className="features-proto-cta-row">
            <Link to="/register" className="features-proto-cta-primary">
              Start Free Trial <ArrowRight size={18} className="features-proto-cta-arrow" />
            </Link>
            <Link to="/" className="features-proto-cta-secondary">Learn More</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="features-proto-footer">
        <p>© 2026 FinTrackr. All rights reserved.</p>
      </footer>
    </div>
  );
}
