// IndexedDB persistence — the on-device store that must never lose data.
// Every write here is the "primary save"; GitHub sync (sync.js) is a
// background best-effort mirror on top of it, never a precondition for it.

const DB_NAME = "tcm_tracker";
const DB_VERSION = 1;
const ENTRIES_STORE = "entries";
const META_STORE = "meta";

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        db.createObjectStore(ENTRIES_STORE, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

export async function getEntry(date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, ENTRIES_STORE, "readonly").get(date);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, ENTRIES_STORE, "readwrite").put(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, ENTRIES_STORE, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getUnsyncedEntries() {
  const all = await getAllEntries();
  return all.filter((e) => (e.updatedAt || 0) > (e.syncedAt || 0));
}

export async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, META_STORE, "readonly").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, META_STORE, "readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, META_STORE, "readwrite").put({ key, value });
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}
