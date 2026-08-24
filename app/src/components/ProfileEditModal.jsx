import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useAuth } from '../auth/AuthContext';
import ErrorAlert from './ErrorAlert';

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
    addressValidationError = `Address must be at least ${ADDRESS_MIN_LENGTH} characters.`;
  } else if (addressLength > ADDRESS_MAX_LENGTH) {
    addressValidationError = `Address must be ${ADDRESS_MAX_LENGTH} characters or fewer.`;
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
      setError(err.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={saving ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="profile-modal-title"
    >
      <DialogTitle id="profile-modal-title">Edit Profile</DialogTitle>

      <form onSubmit={handleSaveProfile}>
        <DialogContent dividers>
          <p className="help-text" style={{ marginTop: 0 }}>Update your personal details.</p>

          <div className="stack-form">
            <label>
              First Name
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </label>
            <label>
              Last Name
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                placeholder="+14155552671"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
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
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
              <span className={addressValidationError ? 'error-text' : 'help-text'}>
                {addressValidationError || `${addressLength}/${ADDRESS_MAX_LENGTH} characters`}
              </span>
            </label>

            {error ? <ErrorAlert message={error} /> : null}
            {message ? <p className="help-text" role="status">{message}</p> : null}
          </div>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={saving} variant="outlined">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving || hasValidationErrors}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
