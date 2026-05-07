import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_MAX_LENGTH = 120;

export default function ProfileEditModal({ isOpen, onClose }) {
  const { profile, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    address: profile?.address || '',
  });

  useEffect(() => {
    setForm({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
    });
  }, [profile]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

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
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="profile-modal-backdrop" role="presentation" onClick={onClose}>
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
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving || hasValidationErrors}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
