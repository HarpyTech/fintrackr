import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Smartphone, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { apiRequest } from '../lib/api';
import { getOrCreateDeviceId, clearDeviceBinding } from '../lib/deviceBinding';
import { useWebAuthn } from '../hooks/useWebAuthn';
import ErrorAlert from '../components/ErrorAlert';
import PageSpinner from '../components/PageSpinner';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const [devicesInfo, setDevicesInfo] = useState('');
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [deletingDeviceId, setDeletingDeviceId] = useState(null);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [confirmDevice, setConfirmDevice] = useState(null);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

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
    setDevicesInfo('');
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

  useEffect(() => {
    if (!isWebAuthnSupported) return;
    (async () => {
      const id = await getOrCreateDeviceId().catch(() => null);
      setCurrentDeviceId(id);
    })();
  }, [isWebAuthnSupported]);

  const managedDevices = useMemo(() => {
    const mapped = devices.map((device) => {
      const isCurrent = Boolean(currentDeviceId) && device.device_id === currentDeviceId;
      const hasName = Boolean(device.device_name && device.device_name.trim());
      const isUnknown = !hasName || device.device_name === `Device ${device.device_id.slice(0, 8)}`;
      const sortLastUsed = device.last_used_at ? new Date(device.last_used_at).getTime() : 0;
      return {
        ...device,
        isCurrent,
        isUnknown,
        sortLastUsed,
        displayName: hasName ? device.device_name : `Device ${device.device_id.slice(0, 8)}`,
      };
    });

    return mapped.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) {
        return a.isCurrent ? -1 : 1;
      }
      return b.sortLastUsed - a.sortLastUsed;
    });
  }, [currentDeviceId, devices]);

  const removableOtherDevices = useMemo(
    () => managedDevices.filter((device) => !device.isCurrent),
    [managedDevices]
  );

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

  async function removeDevice(device) {
    const deviceId = device.device_id;
    setDeletingDeviceId(deviceId);
    setDevicesError('');
    setDevicesInfo('');
    try {
      await apiRequest(`/webauthn/credentials/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
      if (device.isCurrent) {
        await clearDeviceBinding().catch(() => {});
      }
      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
      setDevicesInfo(`${device.displayName} removed.`);
    } catch (err) {
      setDevicesError(err.message || 'Failed to remove device.');
    } finally {
      setDeletingDeviceId(null);
    }
  }

  function handleDeleteDevice(device) {
    setConfirmDevice(device);
  }

  async function handleConfirmDelete() {
    if (!confirmDevice) {
      return;
    }
    const device = confirmDevice;
    setConfirmDevice(null);
    await removeDevice(device);
  }

  function handleRemoveOtherDevices() {
    if (removableOtherDevices.length === 0) return;
    setConfirmRemoveOpen(true);
  }

  async function doRemoveOtherDevices() {
    setConfirmRemoveOpen(false);
    setBulkRemoving(true);
    setDevicesError('');
    setDevicesInfo('');

    let removedCount = 0;
    const failedDevices = [];
    const failedDeviceIds = [];

    for (const device of removableOtherDevices) {
      try {
        await apiRequest(`/webauthn/credentials/${encodeURIComponent(device.device_id)}`, { method: 'DELETE' });
        removedCount += 1;
      } catch (_err) {
        failedDevices.push(device.displayName);
        failedDeviceIds.push(device.device_id);
      }
    }

    setDevices((prev) => prev.filter((device) => {
      const toRemove = removableOtherDevices.some((candidate) => candidate.device_id === device.device_id);
      return !toRemove || failedDeviceIds.includes(device.device_id);
    }));

    if (failedDevices.length > 0) {
      setDevicesError(`Removed ${removedCount} device(s). Could not remove: ${failedDevices.join(', ')}.`);
    } else {
      setDevicesInfo(`Removed ${removedCount} device${removedCount > 1 ? 's' : ''}.`);
    }

    setBulkRemoving(false);
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

              {saveError ? <ErrorAlert message={saveError} /> : null}
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
              <div className="settings-device-toolbar">
                <p className="settings-section-label">Devices with saved biometric login credentials.</p>
                {removableOtherDevices.length > 0 ? (
                  <button
                    type="button"
                    className="settings-device-bulk-remove"
                    onClick={handleRemoveOtherDevices}
                    disabled={bulkRemoving || Boolean(deletingDeviceId)}
                  >
                    {bulkRemoving ? 'Removing…' : 'Remove all other devices'}
                  </button>
                ) : null}
              </div>
              {devicesLoading ? (
                <PageSpinner label="Loading devices…" minHeight={60} />
              ) : devicesError ? (
                <ErrorAlert message={devicesError} />
              ) : managedDevices.length === 0 ? (
                <p className="help-text">No biometric devices registered.</p>
              ) : (
                <ul className="settings-devices-list">
                  {managedDevices.map((device) => (
                    <li key={device.device_id} className="settings-device-item">
                      <div className="settings-device-details">
                        <div className="settings-device-title-row">
                          <p className="settings-device-id">{device.displayName}</p>
                          {device.isCurrent ? (
                            <span className="settings-device-badge settings-device-badge-current">Current device</span>
                          ) : null}
                          {device.isUnknown ? (
                            <span className="settings-device-badge settings-device-badge-unknown">Unknown device</span>
                          ) : null}
                        </div>
                        <p className="settings-device-meta">
                          ID: {device.device_id.slice(0, 8)}…
                          <br />
                          Last used:{' '}
                          {device.last_used_at
                            ? new Date(device.last_used_at).toLocaleString()
                            : 'Unknown'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="settings-device-remove"
                        onClick={() => handleDeleteDevice(device)}
                        disabled={deletingDeviceId === device.device_id}
                        aria-label={`Remove ${device.displayName}`}
                      >
                        {deletingDeviceId === device.device_id ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {devicesInfo ? <p className="help-text" role="status">{devicesInfo}</p> : null}
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

      {confirmDevice ? (
        <div className="settings-modal-backdrop" role="presentation">
          <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="remove-device-title">
            <h3 id="remove-device-title">Remove device?</h3>
            <p>
              You are about to remove <strong>{confirmDevice.displayName}</strong>.
            </p>
            {confirmDevice.isCurrent ? (
              <p className="settings-modal-warning">
                This is your current device. Removing it will disable biometric login on this device.
              </p>
            ) : null}
            <div className="settings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmDevice(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-device-remove"
                onClick={handleConfirmDelete}
              >
                Remove device
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Remove Other Devices"
        message={`Remove ${removableOtherDevices.length} other device${removableOtherDevices.length !== 1 ? 's' : ''}? They will need to re-register biometrics.`}
        confirmLabel="Remove"
        danger
        onConfirm={doRemoveOtherDevices}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </div>
  );
}
