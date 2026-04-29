import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from './ThemeToggle';

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_MAX_LENGTH = 120;

export default function SettingsWidget() {
  const { session, profile, updateProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const widgetRef = useRef(null);

  const displayName = useMemo(() => {
    const firstName = profile?.first_name?.trim();
    const lastName = profile?.last_name?.trim();
    if (firstName || lastName) {
      return [firstName, lastName].filter(Boolean).join(' ');
    }
    return session?.user || 'User';
  }, [profile, session?.user]);

  const initials = useMemo(() => {
    const firstName = profile?.first_name?.trim();
    const lastName = profile?.last_name?.trim();
    if (firstName && lastName) {
      return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
    }
    if (firstName) {
      const fallback = session?.user || '';
      return (firstName.charAt(0) + fallback.charAt(0)).replace(/\s/g, '').toUpperCase().slice(0, 2) || 'U';
    }
    const emailCandidate = (session?.user || '').trim();
    if (emailCandidate.includes('@')) {
      const localPart = emailCandidate.split('@')[0] || '';
      const localChars = localPart.replace(/[^a-zA-Z]/g, '');
      return localChars.slice(0, 2).toUpperCase() || 'U';
    }
    return emailCandidate.slice(0, 2).toUpperCase() || 'U';
  }, [profile, session?.user]);

  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    address: profile?.address || '',
  });

  const trimmedPhone = form.phone?.trim() || '';
  const normalizedPhone = trimmedPhone.replace(/[\s()-]/g, '');
  const trimmedAddress = form.address?.trim() || '';
  const addressLength = trimmedAddress.length;

  const phoneValidationError =
    normalizedPhone && !PHONE_PATTERN.test(normalizedPhone)
      ? 'Use a valid phone format, for example +14155552671.'
      : '';

  let addressValidationError = '';
  if (trimmedAddress && addressLength < ADDRESS_MIN_LENGTH) {
    addressValidationError = 'Address must be at least ' + ADDRESS_MIN_LENGTH + ' characters.';
  } else if (addressLength > ADDRESS_MAX_LENGTH) {
    addressValidationError = 'Address must be ' + ADDRESS_MAX_LENGTH + ' characters or fewer.';
  }

  const hasValidationErrors = Boolean(phoneValidationError || addressValidationError);

  useEffect(() => {
    setForm({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
    });
  }, [profile]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (isOpen && widgetRef.current && !widgetRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleChatVisibility(event) {
      const nextIsOpen = Boolean(event?.detail?.isOpen);
      setIsChatOpen(nextIsOpen);
      if (nextIsOpen) {
        setIsOpen(false);
        setIsProfileOpen(false);
      }
    }

    window.addEventListener('expense-chat:visibility-change', handleChatVisibility);
    return () => {
      window.removeEventListener('expense-chat:visibility-change', handleChatVisibility);
    };
  }, []);

  async function handleSaveProfile(event) {
    event.preventDefault();
    if (hasValidationErrors) {
      setError('Please fix the highlighted profile fields and try again.');
      setMessage('');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateProfile({
        ...form,
        phone: normalizedPhone,
        address: trimmedAddress,
      });
      setMessage('Profile updated successfully.');
      window.setTimeout(() => {
        setIsProfileOpen(false);
      }, 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={`settings-widget-container${isChatOpen ? ' is-chat-open' : ''}`} ref={widgetRef}>
        {isOpen && !isProfileOpen ? (
          <div className="profile-dropdown" role="menu" aria-label="Settings menu" style={{ position: 'static', width: '260px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="profile-icon-button">
                <span aria-hidden="true">{initials}</span>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <p className="profile-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
                <p className="profile-email" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.user}</p>
              </div>
            </div>
            
            <button
              type="button"
              role="menuitem"
              className="profile-dropdown-action"
              onClick={() => {
                setIsProfileOpen(true);
                setIsOpen(false);
                setMessage('');
                setError('');
              }}
              style={{ marginBottom: '16px' }}
            >
              Edit Profile
            </button>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px 0', fontWeight: '600' }}>Theme</p>
              <ThemeToggle />
            </div>
          </div>
        ) : null}

        {!isProfileOpen && (
          <button
            type="button"
            className="settings-widget-launcher"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label="Open settings"
          >
            {isOpen ? <X /> : <Settings />}
          </button>
        )}
      </div>

      {isProfileOpen ? (
        <div className="profile-modal-backdrop" role="presentation" onClick={() => setIsProfileOpen(false)}>
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="profile-modal-title">Edit Profile</h2>
            <p className="help-text">Update your personal details.</p>

            <form className="stack-form" onSubmit={handleSaveProfile}>
              <label>
                First Name
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                />
              </label>
              <label>
                Last Name
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  placeholder="+14155552671"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
                {phoneValidationError ? (
                  <span className="error-text">{phoneValidationError}</span>
                ) : (
                  <span className="help-text">Include country code when possible.</span>
                )}
              </label>
              <label>
                Address
                <textarea
                  maxLength={ADDRESS_MAX_LENGTH + 15}
                  value={form.address}
                  onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                />
                <span className={addressValidationError ? 'error-text' : 'help-text'}>
                  {addressValidationError || (addressLength + '/' + ADDRESS_MAX_LENGTH + ' characters')}
                </span>
              </label>

              {error ? <p className="error-text">{error}</p> : null}
              {message ? <p className="help-text">{message}</p> : null}

              <div className="profile-modal-actions">
                <button type="button" className="secondary-button" onClick={() => setIsProfileOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={saving || hasValidationErrors}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
