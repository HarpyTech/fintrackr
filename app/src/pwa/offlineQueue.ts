const DATABASE_NAME = 'fintrackr-pwa';
const STORE_NAME = 'request-queue';
const SYNC_TAG = 'fintrackr-expense-sync';

function openQueueDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('queuedAt', 'queuedAt');
      }
    };
  });
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export interface QueueOfflineRequestInput {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

/** Extends the sync manager registration, which TS's DOM lib does not model yet. */
interface SyncManagerRegistration extends ServiceWorkerRegistration {
  sync: { register: (tag: string) => Promise<void> };
}

export async function queueOfflineRequest({ url, method, headers, body }: QueueOfflineRequestInput): Promise<void> {
  const database = await openQueueDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add({
      url,
      method,
      headers: headersToObject(headers),
      body,
      queuedAt: Date.now(),
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  await requestBackgroundSync();
}

export async function requestBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  if ('sync' in registration) {
    try {
      await (registration as SyncManagerRegistration).sync.register(SYNC_TAG);
      return;
    } catch {
      // Fall back to direct worker messaging when Background Sync is unavailable.
    }
  }

  registration.active?.postMessage({ type: 'SYNC_OFFLINE_EXPENSES' });
}
