const DB_NAME = 'english-skills-studio';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let dbPromise = null;
let warned = false;

function warn(message, error) {
  if (warned) return;
  warned = true;
  console.warn(`[progress-db] ${message}`, error || '');
}

function ensureIndexedDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment.');
  }
}

function openDb() {
  ensureIndexedDb();
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });

  return dbPromise;
}

function runTransaction(mode, job) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        job(store, resolve, reject);
      })
  );
}

function orderStorageKey(pageKey) {
  return `order:${pageKey}`;
}

function countStorageKey(counterKey) {
  return `count:${counterKey}`;
}

export async function initProgressDb() {
  try {
    await openDb();
  } catch (error) {
    warn('init failed', error);
  }
}

export async function saveOrder(pageKey, orderedIds) {
  try {
    await runTransaction('readwrite', (store, resolve, reject) => {
      const req = store.put({
        key: orderStorageKey(pageKey),
        value: Array.isArray(orderedIds) ? orderedIds : [],
        updatedAt: Date.now()
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to save order.'));
    });
  } catch (error) {
    warn('saveOrder failed', error);
  }
}

export async function getOrder(pageKey) {
  try {
    return await runTransaction('readonly', (store, resolve, reject) => {
      const req = store.get(orderStorageKey(pageKey));
      req.onsuccess = () => {
        const value = req.result?.value;
        resolve(Array.isArray(value) ? value : null);
      };
      req.onerror = () => reject(req.error || new Error('Failed to load order.'));
    });
  } catch (error) {
    warn('getOrder failed', error);
    return null;
  }
}

export async function getCount(counterKey) {
  try {
    return await runTransaction('readonly', (store, resolve, reject) => {
      const req = store.get(countStorageKey(counterKey));
      req.onsuccess = () => {
        const count = Number(req.result?.value || 0);
        resolve(Number.isFinite(count) ? count : 0);
      };
      req.onerror = () => reject(req.error || new Error('Failed to load count.'));
    });
  } catch (error) {
    warn('getCount failed', error);
    return 0;
  }
}

export async function incrementCount(counterKey) {
  const storageKey = countStorageKey(counterKey);
  try {
    return await runTransaction('readwrite', (store, resolve, reject) => {
      const getReq = store.get(storageKey);
      getReq.onsuccess = () => {
        const current = Number(getReq.result?.value || 0);
        const next = (Number.isFinite(current) ? current : 0) + 1;
        const putReq = store.put({ key: storageKey, value: next, updatedAt: Date.now() });
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error || new Error('Failed to increment count.'));
      };
      getReq.onerror = () => reject(getReq.error || new Error('Failed to read count.'));
    });
  } catch (error) {
    warn('incrementCount failed', error);
    return 0;
  }
}

export async function getCountsByPrefix(prefix) {
  const result = {};
  const needle = countStorageKey(prefix);
  try {
    return await runTransaction('readonly', (store, resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(result);
          return;
        }
        const key = String(cursor.key || '');
        if (key.startsWith(needle)) {
          const counterKey = key.slice('count:'.length);
          result[counterKey] = Number(cursor.value?.value || 0);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error('Failed to scan counts.'));
    });
  } catch (error) {
    warn('getCountsByPrefix failed', error);
    return {};
  }
}
