import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from './ThemeToggle';
import { apiRequest } from '../lib/api';
import { getOrCreateDeviceId, clearDeviceBinding } from '../lib/deviceBinding';
import { useWebAuthn } from '../hooks/useWebAuthn';

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_MAX_LENGTH = 120;

export default function SettingsWidget() {
  const { session, profile, updateProfile } = useAuth();
  const { isSupported: isWebAuthnSupported } = useWebAuthn();
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDevicesOpen, setIsDevicesOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState('');
  const [deletingDeviceId, setDeletingDeviceId] = useState(null);
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

  const loadDevices = useCallback(async () => {
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
  }, []);

  async function openDevices() {
    setIsDevicesOpen(true);
    setIsOpen(false);
    setDevicesError('');
    await loadDevices();
  }

  async function handleDeleteDevice(deviceId) {
    setDeletingDeviceId(deviceId);
    setDevicesError('');
    try {
      await apiRequest(`/webauthn/credentials/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
      // Clear local binding if deleting the current device
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
        setIsDevicesOpen(false);
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
        setIsDevicesOpen(false);
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
              style={{ marginBottom: '8px' }}
            >
              Edit Profile
            </button>

            {isWebAuthnSupported && (
              <button
                type="button"
                role="menuitem"
                className="profile-dropdown-action"
                onClick={openDevices}
                style={{ marginBottom: '16px' }}
              >
                Manage Devices
              </button>
            )}

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px 0', fontWeight: '600' }}>Theme</p>
              <ThemeToggle />
            </div>
          </div>
        ) : null}

        {!isProfileOpen && !isDevicesOpen && (
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

      {isDevicesOpen ? (
        <div className="profile-modal-backdrop" role="presentation" onClick={() => setIsDevicesOpen(false)}>
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="devices-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="devices-modal-title">Registered Devices</h2>
            <p className="help-text">Devices with saved biometric login credentials.</p>

            {devicesLoading ? (
              <p className="help-text">Loading devices…</p>
            ) : devicesError ? (
              <p className="error-text" role="alert">{devicesError}</p>
            ) : devices.length === 0 ? (
              <p className="help-text">No biometric devices registered.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>
                {devices.map((device) => (
                  <li
                    key={device.device_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>
                        {device.device_id.slice(0, 8)}…
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                        Last used:{' '}
                        {device.last_used_at
                          ? new Date(device.last_used_at).toLocaleDateString()
                          : 'Unknown'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ fontSize: '12px', padding: '4px 10px' }}
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

            <div className="profile-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setIsDevicesOpen(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
