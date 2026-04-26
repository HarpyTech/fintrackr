import { useMemo, useState } from 'react';
import { usePwa } from '../pwa/PwaContext';

function getInstallHelp(platform) {
  if (platform === 'ios') {
    return 'On iPhone or iPad, use Safari Share > Add to Home Screen.';
  }
  if (platform === 'android') {
    return 'On Android, you can also install from the browser menu if the prompt is not shown.';
  }
  if (platform === 'windows' || platform === 'macos') {
    return 'On desktop browsers, use Install App in the address bar or browser menu if needed.';
  }
  return 'If the browser does not show a prompt, install from the browser menu.';
}

export default function InstallAppButton({ variant = 'default' }) {
  const { canInstall, installStatus, isOffline, isStandalone, platform, promptInstall } = usePwa();
  const [feedback, setFeedback] = useState('');

  const isInstalled = isStandalone || installStatus === 'installed';

  const hint = useMemo(() => getInstallHelp(platform), [platform]);

  async function handleInstall() {
    if (!canInstall) {
      setFeedback(hint);
      return;
    }

    const result = await promptInstall();
    if (result.outcome === 'accepted') {
      setFeedback('Installation started. FinTrackr will open in its own window when setup finishes.');
      return;
    }

    if (result.outcome === 'dismissed') {
      setFeedback('Installation was cancelled. You can try again later from the browser menu.');
      return;
    }

    setFeedback(hint);
  }

  const wrapperClass = variant === 'hero' ? 'pwa-install pwa-install-hero' : 'pwa-install';
  const buttonClass = variant === 'hero' ? 'landing-secondary-cta pwa-install-button' : 'secondary-button pwa-install-button';
  const buttonLabel = isInstalled ? 'Installed' : 'Install App';
  const statusMessage = isInstalled ? 'Installation complete. FinTrackr is ready to use on this device.' : feedback;

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        className={buttonClass}
        onClick={handleInstall}
        disabled={isInstalled}
      >
        {buttonLabel}
      </button>
      {!isInstalled ? (
        <p className="pwa-install-copy">
          {isOffline ? 'Offline mode is available once the app shell has been cached.' : 'Install FinTrackr for faster launches and a full-screen experience.'}
        </p>
      ) : null}
      {statusMessage ? (
        <p className="pwa-install-feedback" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}