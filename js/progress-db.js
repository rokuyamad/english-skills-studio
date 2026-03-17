const DB_NAME = 'english-skills-studio';
const DB_VERSION = 2;
const KV_STORE = 'kv';
const EVENTS_STORE = 'events';

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
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const events = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
        events.createIndex('bySyncStatus', 'syncStatus', { unique: false });
        events.createIndex('byOccurredAt', 'occurredAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });

  return dbPromise;
}

function runTransaction(storeName, mode, job) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        job(store, resolve, reject, tx);
      })
  );
}

function orderStorageKey(pageKey) {
  return `order:${pageKey}`;
}

function countStorageKey(counterKey) {
  return `count:${counterKey}`;
}

function kvStorageKey(key) {
  return `kv:${key}`;
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
    await runTransaction(KV_STORE, 'readwrite', (store, resolve, reject) => {
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
    return await runTransaction(KV_STORE, 'readonly', (store, resolve, reject) => {
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
    return await runTransaction(KV_STORE, 'readonly', (store, resolve, reject) => {
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
    return await runTransaction(KV_STORE, 'readwrite', (store, resolve, reject) => {
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
    return await runTransaction(KV_STORE, 'readonly', (store, resolve, reject) => {
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

export async function getKv(key, defaultValue = null) {
  try {
    return await runTransaction(KV_STORE, 'readonly', (store, resolve, reject) => {
      const req = store.get(kvStorageKey(key));
      req.onsuccess = () => {
        const value = req.result?.value;
        resolve(value === undefined ? defaultValue : value);
      };
      req.onerror = () => reject(req.error || new Error('Failed to load kv.'));
    });
  } catch (error) {
    warn('getKv failed', error);
    return defaultValue;
  }
}

export async function setKv(key, value) {
  try {
    await runTransaction(KV_STORE, 'readwrite', (store, resolve, reject) => {
      const req = store.put({ key: kvStorageKey(key), value, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to save kv.'));
    });
  } catch (error) {
    warn('setKv failed', error);
  }
}

export async function recordStudyEvent(event) {
  if (!event?.id) return;
  try {
    await runTransaction(EVENTS_STORE, 'readwrite', (store, resolve, reject) => {
      const req = store.put({
        ...event,
        syncStatus: event.syncStatus || 'pending',
        updatedAt: Date.now()
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to record study event.'));
    });
  } catch (error) {
    warn('recordStudyEvent failed', error);
  }
}

export async function deleteStudyEvent(id) {
  if (!id) return;
  try {
    await runTransaction(EVENTS_STORE, 'readwrite', (store, resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to delete study event.'));
    });
  } catch (error) {
    warn('deleteStudyEvent failed', error);
  }
}

export async function listStudyEvents() {
  const result = [];
  try {
    return await runTransaction(EVENTS_STORE, 'readonly', (store, resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(result);
          return;
        }
        result.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error('Failed to list study events.'));
    });
  } catch (error) {
    warn('listStudyEvents failed', error);
    return [];
  }
}

export async function listPendingStudyEvents(limit = 200) {
  const result = [];
  try {
    return await runTransaction(EVENTS_STORE, 'readonly', (store, resolve, reject) => {
      const index = store.index('bySyncStatus');
      const req = index.openCursor(IDBKeyRange.only('pending'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || result.length >= limit) {
          resolve(result);
          return;
        }
        result.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error('Failed to list pending study events.'));
    });
  } catch (error) {
    warn('listPendingStudyEvents failed', error);
    return [];
  }
}

export async function markStudyEventsSynced(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  try {
    await runTransaction(EVENTS_STORE, 'readwrite', (store, resolve, reject) => {
      let completed = 0;
      const done = () => {
        completed += 1;
        if (completed >= ids.length) resolve();
      };

      ids.forEach((id) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const row = getReq.result;
          if (!row) {
            done();
            return;
          }
          const putReq = store.put({ ...row, syncStatus: 'synced', syncedAt: new Date().toISOString(), updatedAt: Date.now() });
          putReq.onsuccess = () => done();
          putReq.onerror = () => reject(putReq.error || new Error('Failed to mark synced event.'));
        };
        getReq.onerror = () => reject(getReq.error || new Error('Failed to load event while syncing.'));
      });
    });
  } catch (error) {
    warn('markStudyEventsSynced failed', error);
  }
}
