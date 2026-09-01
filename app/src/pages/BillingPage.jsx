import { useState } from 'react';
import { CheckCircle, Zap, Crown, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { usePlan } from '../lib/featureFlags';
import { apiRequest } from '../lib/api';
import ErrorAlert from '../components/ErrorAlert';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '₹0',
    period: 'forever',
    Icon: Sparkles,
    accentVar: '--muted',
    bgVar: '--surface-soft',
    features: [
      '15 expenses per month',
      'Manual expense entry',
      'Basic dashboard & charts',
      'PDF / image receipt upload',
      'CSV export',
    ],
  },
  {
    key: 'go',
    name: 'Go',
    price: '₹299',
    period: 'per month',
    Icon: Zap,
    accentVar: '--brand',
    bgVar: '--brand-soft',
    highlight: true,
    features: [
      '100 expenses per month',
      'AI receipt scanning',
      'AI Insights & analytics chat',
      'Priority email support',
      'Everything in Free',
    ],
  },
  {
    key: 'max',
    name: 'Max',
    price: '₹799',
    period: 'per month',
    Icon: Crown,
    accentVar: '--violet',
    bgVar: '--violet-soft',
    features: [
      'Unlimited expenses',
      'Advanced AI analytics',
      'Custom expense categories',
      'Bulk CSV import',
      'Everything in Go',
    ],
  },
];

export default function BillingPage() {
  const { profile, refreshProfile } = useAuth();
  const { plan: currentPlan } = usePlan();
  const [upgrading, setUpgrading] = useState(null);
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeSuccess, setUpgradeSuccess] = useState('');

  const tierOrder = { free: 0, go: 1, max: 2 };
  const currentTier = tierOrder[currentPlan] ?? 0;

  async function handleUpgrade(planKey) {
    if (planKey === currentPlan) return;
    setUpgrading(planKey);
    setUpgradeError('');
    setUpgradeSuccess('');
    try {
      await apiRequest('/users/me/plan', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey }),
      });
      await refreshProfile();
      const label = PLANS.find((p) => p.key === planKey)?.name || planKey;
      setUpgradeSuccess(`You are now on the ${label} plan.`);
    } catch (err) {
      setUpgradeError(err.message || 'Unable to change plan. Please try again.');
    } finally {
      setUpgrading(null);
    }
  }

  return (
    <main className="billing-page">
      <div className="billing-container">
        <header className="billing-header">
          <h1 className="billing-title">Plans &amp; Billing</h1>
          <p className="billing-subtitle">
            Choose the plan that matches how you track spending.
          </p>
        </header>

        {upgradeError ? <ErrorAlert message={upgradeError} /> : null}
        {upgradeSuccess ? (
          <p className="billing-success" role="status">{upgradeSuccess}</p>
        ) : null}

        <div className="billing-cards">
          {PLANS.map(({ key, name, price, period, Icon, accentVar, bgVar, highlight, features }) => {
            const isCurrent = key === currentPlan;
            const isDowngrade = tierOrder[key] < currentTier;
            const isLoading = upgrading === key;

            let ctaLabel;
            if (isCurrent) ctaLabel = 'Current plan';
            else if (isDowngrade) ctaLabel = `Switch to ${name}`;
            else ctaLabel = `Upgrade to ${name}`;

            return (
              <div
                key={key}
                className={`billing-card${highlight ? ' billing-card-highlight' : ''}${isCurrent ? ' billing-card-current' : ''}`}
              >
                {highlight && !isCurrent ? (
                  <span className="billing-card-badge">Most Popular</span>
                ) : null}
                {isCurrent ? (
                  <span className="billing-card-badge billing-card-badge-current">Current Plan</span>
                ) : null}

                <div className="billing-card-head">
                  <span
                    className="billing-card-icon"
                    style={{ background: `var(${bgVar})`, color: `var(${accentVar})` }}
                    aria-hidden="true"
                  >
                    <Icon size={20} />
                  </span>
                  <div>
                    <h2 className="billing-card-name">{name}</h2>
                    <div className="billing-card-price">
                      <span className="billing-card-amount">{price}</span>
                      <span className="billing-card-period">{period}</span>
                    </div>
                  </div>
                </div>

                <ul className="billing-card-features">
                  {features.map((feat) => (
                    <li key={feat} className="billing-card-feature">
                      <CheckCircle
                        size={15}
                        className="billing-card-feature-icon"
                        style={{ color: `var(${accentVar})` }}
                        aria-hidden="true"
                      />
                      {feat}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`billing-card-cta${highlight && !isCurrent ? ' billing-card-cta-primary' : ''}`}
                  disabled={isCurrent || isLoading}
                  onClick={() => handleUpgrade(key)}
                >
                  {isLoading ? 'Updating…' : ctaLabel}
                </button>
              </div>
            );
          })}
        </div>

        <p className="billing-note">
          Plan changes take effect immediately. All prices are in INR and exclude GST.
          Contact <a href="mailto:support@fintrackr.app">support@fintrackr.app</a> for invoices or enterprise pricing.
        </p>
      </div>
    </main>
  );
}
