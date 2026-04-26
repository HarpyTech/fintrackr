import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PwaContext = createContext(null);

function detectPlatform() {
  const userAgent = navigator.userAgent || '';

  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return 'ios';
  }
  if (/Android/i.test(userAgent)) {
    return 'android';
  }
  if (/Windows/i.test(userAgent)) {
    return 'windows';
  }
  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return 'macos';
  }
  return 'web';
}

function getStandaloneState() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function PwaProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installStatus, setInstallStatus] = useState(getStandaloneState() ? 'installed' : 'idle');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [platform, setPlatform] = useState(detectPlatform());
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)');

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
      setInstallStatus((current) => (current === 'installed' ? current : 'available'));
    }

    function handleAppInstalled() {
      setDeferredPrompt(null);
      setInstallStatus('installed');
    }

    function handleOnline() {
      setIsOffline(false);
      setSyncMessage('Back online. Any queued expense changes will sync automatically.');
    }

    function handleOffline() {
      setIsOffline(true);
      setSyncMessage('Offline mode is active. Cached screens remain available.');
    }

    function handleStandaloneChange() {
      if (getStandaloneState()) {
        setInstallStatus('installed');
      }
    }

    function handleServiceWorkerMessage(event) {
      const messageType = event.data?.type;
      if (messageType === 'FINTRACKR_OFFLINE_REQUEST_SYNCED') {
        setSyncMessage('Queued expense changes synced successfully.');
      }
      if (messageType === 'FINTRACKR_OFFLINE_REQUEST_FAILED') {
        setSyncMessage('A queued expense could not be synced and may need attention.');
      }
      if (messageType === 'FINTRACKR_OFFLINE_SYNC_RETRYING') {
        setSyncMessage('Still waiting for a stable connection to sync queued expenses.');
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    standaloneMediaQuery.addEventListener('change', handleStandaloneChange);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    setPlatform(detectPlatform());

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      standaloneMediaQuery.removeEventListener('change', handleStandaloneChange);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) {
      return { outcome: 'unsupported' };
    }

    setInstallStatus('prompting');
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstallStatus(choice.outcome === 'accepted' ? 'accepted' : 'dismissed');
    return choice;
  }

  const value = useMemo(() => ({
    canInstall: Boolean(deferredPrompt) && installStatus !== 'installed',
    installStatus,
    isOffline,
    isStandalone: installStatus === 'installed' || getStandaloneState(),
    platform,
    promptInstall,
    syncMessage,
  }), [deferredPrompt, installStatus, isOffline, platform, syncMessage]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error('usePwa must be used inside PwaProvider');
  }
  return context;
}