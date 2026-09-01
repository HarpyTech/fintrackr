import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, X } from 'lucide-react';

const STORAGE_KEY = 'fintrackr_onboarding_dismissed';

const STEPS = [
  {
    id: 'add_expense',
    label: 'Add your first expense',
    to: '/add-expense',
  },
  {
    id: 'try_insights',
    label: 'Try AI Insights',
    to: '/insights',
  },
  {
    id: 'biometric',
    label: 'Set up biometric login',
    to: '/settings',
  },
];

function isDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function OnboardingBanner({ completedStepIds = [] }) {
  const [dismissed, setDismissed] = useState(isDismissed);

  if (dismissed) return null;

  const allDone = STEPS.every((s) => completedStepIds.includes(s.id));

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // storage unavailable — just hide in memory
    }
    setDismissed(true);
  }

  return (
    <div className="onboarding-banner" role="region" aria-label="Getting started checklist">
      <div className="onboarding-banner-header">
        <h2 className="onboarding-banner-title">
          {allDone ? 'All set! Welcome to FinTrackr.' : 'Get started in 3 steps'}
        </h2>
        <button
          type="button"
          className="onboarding-banner-dismiss"
          onClick={dismiss}
          aria-label="Dismiss getting started checklist"
        >
          <X size={16} />
        </button>
      </div>
      <ol className="onboarding-banner-steps">
        {STEPS.map(({ id, label, to }) => {
          const done = completedStepIds.includes(id);
          return (
            <li key={id} className={`onboarding-banner-step${done ? ' done' : ''}`}>
              {done ? (
                <CheckCircle2 size={16} className="onboarding-banner-step-icon done" aria-hidden="true" />
              ) : (
                <Circle size={16} className="onboarding-banner-step-icon" aria-hidden="true" />
              )}
              {done ? (
                <span>{label}</span>
              ) : (
                <Link to={to} className="onboarding-banner-step-link">{label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
