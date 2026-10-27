import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type PwaPlatform = 'ios' | 'android' | 'windows' | 'macos' | 'web';
export type InstallStatus = 'idle' | 'available' | 'prompting' | 'accepted' | 'dismissed' | 'installed';

/** Not yet part of lib.dom.d.ts — Chromium-only install prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaContextValue {
  canInstall: boolean;
  installStatus: InstallStatus;
  isOffline: boolean;
  isStandalone: boolean;
  platform: PwaPlatform;
  promptInstall: () => Promise<{ outcome: string }>;
  syncMessage: string;
}

const PwaContext = createContext<PwaContextValue | null>(null);

function detectPlatform(): PwaPlatform {
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

function getStandaloneState(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

interface ServiceWorkerSyncMessage {
  type?: string;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus>(getStandaloneState() ? 'installed' : 'idle');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [platform, setPlatform] = useState<PwaPlatform>(detectPlatform());
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)');

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
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

    function handleServiceWorkerMessage(event: MessageEvent<ServiceWorkerSyncMessage>) {
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

  async function promptInstall(): Promise<{ outcome: string }> {
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

  const value = useMemo<PwaContextValue>(() => ({
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

export function usePwa(): PwaContextValue {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error('usePwa must be used inside PwaProvider');
  }
  return context;
}
