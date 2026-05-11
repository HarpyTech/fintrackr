/**
 * Device binding utilities.
 *
 * A stable, per-device UUID is generated once and stored in IndexedDB.
 * This ID ties a WebAuthn credential to the device that created it.
 * IndexedDB is preferred over localStorage because it persists across
 * PWA installations and is not cleared by normal browser data wipes.
 */

const DB_NAME = "fintrackr_device";
const STORE_NAME = "binding";
const KEY = "device_id";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function generateUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] &
        (15 >> (c / 4)))).toString(16)
  );
}

/**
 * Returns the device UUID, creating and persisting it if it doesn't exist yet.
 */
export async function getOrCreateDeviceId() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const getReq = store.get(KEY);
    getReq.onsuccess = () => {
      if (getReq.result) {
        resolve(getReq.result);
        return;
      }
      const newId = generateUUID();
      const putReq = store.put(newId, KEY);
      putReq.onsuccess = () => resolve(newId);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Returns the stored credential ID for WebAuthn (null if none registered).
 */
export async function getStoredCredentialId() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get("credential_id");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist the credential ID after successful WebAuthn registration.
 */
export async function storeCredentialId(credentialId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(credentialId, "credential_id");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist the username associated with the stored WebAuthn credential.
 */
export async function storeBindingUsername(username) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(username, "bound_username");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Return the username that has a WebAuthn credential on this device.
 */
export async function getBoundUsername() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get("bound_username");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear all biometric binding data (credential removed or user logged out with revoke).
 */
export async function clearDeviceBinding() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete("credential_id");
    store.delete("bound_username");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * True when running as an installed PWA (standalone display mode).
 */
export function isInstalledPwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}
