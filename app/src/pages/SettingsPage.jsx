import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Smartphone, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { apiRequest } from '../lib/api';
import { getOrCreateDeviceId, clearDeviceBinding } from '../lib/deviceBinding';
import { useWebAuthn } from '../hooks/useWebAuthn';

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_MAX_LENGTH = 120;

export default function SettingsPage() {
  const navigate = useNavigate();
  const { session, profile, updateProfile, logout } = useAuth();
  const { isSupported: isWebAuthnSupported } = useWebAuthn();

  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    address: profile?.address || '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState('');
  const [deletingDeviceId, setDeletingDeviceId] = useState(null);

  useEffect(() => {
    setForm({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
    });
  }, [profile]);

  const loadDevices = useCallback(async () => {
    if (!isWebAuthnSupported) return;
    setDevicesLoading(true);
    setDevicesError('');
    try {
      const data = await apiRequest('/webauthn/credentials');
      setDevices(data.credentials || []);
    } catch (err) {
      setDevicesError(err.message || 'Failed to load devices.');
    } finally {
      setDevicesLoading(false);
    }
  }, [isWebAuthnSupported]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

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
      setSaveError('Please fix the highlighted fields and try again.');
      setSaveMessage('');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      await updateProfile({
        ...form,
        phone: normalizedPhone,
        address: trimmedAddress,
      });
      setSaveMessage('Profile updated successfully.');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDevice(deviceId) {
    setDeletingDeviceId(deviceId);
    setDevicesError('');
    try {
      await apiRequest(`/webauthn/credentials/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
      const currentDeviceId = await getOrCreateDeviceId().catch(() => null);
      if (currentDeviceId === deviceId) {
        await clearDeviceBinding().catch(() => {});
      }
      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
    } catch (err) {
      setDevicesError(err.message || 'Failed to remove device.');
    } finally {
      setDeletingDeviceId(null);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Settings</h1>

      <div className="settings-grid">
        {/* ── Profile ── */}
        <section className="settings-card" aria-labelledby="settings-profile-heading">
          <div className="settings-card-header">
            <User size={18} className="settings-card-icon" aria-hidden="true" />
            <h2 id="settings-profile-heading">Profile</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-profile-summary">
              <span className="settings-avatar" aria-hidden="true">{initials}</span>
              <div className="settings-profile-meta">
                <span className="settings-profile-name">{displayName}</span>
                <span className="settings-profile-email">{session?.user}</span>
              </div>
            </div>

            <form className="stack-form settings-form" onSubmit={handleSaveProfile}>
              <div className="settings-form-row">
                <label>
                  First Name
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                Phone
                <input
                  type="tel"
                  placeholder="+14155552671"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
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
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                />
                <span className={addressValidationError ? 'error-text' : 'help-text'}>
                  {addressValidationError || `${addressLength}/${ADDRESS_MAX_LENGTH} characters`}
                </span>
              </label>

              {saveError ? <p className="error-text" role="alert">{saveError}</p> : null}
              {saveMessage ? <p className="help-text" role="status">{saveMessage}</p> : null}

              <div>
                <button type="submit" disabled={saving || hasValidationErrors}>
                  {saving ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ── Appearance ── */}
        <section className="settings-card" aria-labelledby="settings-appearance-heading">
          <div className="settings-card-header">
            <h2 id="settings-appearance-heading">Appearance</h2>
          </div>
          <div className="settings-card-body">
            <p className="settings-section-label">Theme</p>
            <ThemeToggle />
          </div>
        </section>

        {/* ── Biometric Devices ── */}
        {isWebAuthnSupported ? (
          <section className="settings-card" aria-labelledby="settings-devices-heading">
            <div className="settings-card-header">
              <Smartphone size={18} className="settings-card-icon" aria-hidden="true" />
              <h2 id="settings-devices-heading">Biometric Devices</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-section-label">Devices with saved biometric login credentials.</p>
              {devicesLoading ? (
                <p className="help-text">Loading…</p>
              ) : devicesError ? (
                <p className="error-text" role="alert">{devicesError}</p>
              ) : devices.length === 0 ? (
                <p className="help-text">No biometric devices registered.</p>
              ) : (
                <ul className="settings-devices-list">
                  {devices.map((device) => (
                    <li key={device.device_id} className="settings-device-item">
                      <div>
                        <p className="settings-device-id">{device.device_id.slice(0, 8)}…</p>
                        <p className="settings-device-meta">
                          Last used:{' '}
                          {device.last_used_at
                            ? new Date(device.last_used_at).toLocaleDateString()
                            : 'Unknown'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0 }}
                        onClick={() => handleDeleteDevice(device.device_id)}
                        disabled={deletingDeviceId === device.device_id}
                        aria-label={`Remove device ${device.device_id.slice(0, 8)}`}
                      >
                        {deletingDeviceId === device.device_id ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {/* ── Account ── */}
        <section className="settings-card" aria-labelledby="settings-account-heading">
          <div className="settings-card-header">
            <h2 id="settings-account-heading">Account</h2>
          </div>
          <div className="settings-card-body">
            <p className="settings-section-label">
              Signed in as <strong>{session?.user}</strong>
            </p>
            <button
              type="button"
              className="settings-logout-button"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
