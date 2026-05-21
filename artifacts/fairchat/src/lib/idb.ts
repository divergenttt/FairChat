const DB_NAME = "fairchat_cache";
const DB_VERSION = 2;
const STORE_MSGS = "messages";
const STORE_CONVS = "conversations";
const STORE_KEYS = "keys";

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MSGS))  db.createObjectStore(STORE_MSGS);
      if (!db.objectStoreNames.contains(STORE_CONVS)) db.createObjectStore(STORE_CONVS);
      if (!db.objectStoreNames.contains(STORE_KEYS))  db.createObjectStore(STORE_KEYS);
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror   = () => reject(req.error);
  });
}

function tx(store: string, mode: IDBTransactionMode) {
  return openDb().then(db => db.transaction(store, mode).objectStore(store));
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  try {
    const s = await tx(store, "readonly");
    return await new Promise<T | undefined>((res, rej) => {
      const r = s.get(key);
      r.onsuccess = () => res(r.result as T | undefined);
      r.onerror   = () => rej(r.error);
    });
  } catch { return undefined; }
}

export async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  try {
    const s = await tx(store, "readwrite");
    await new Promise<void>((res, rej) => {
      const r = s.put(value, key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  } catch {}
}

export async function idbDel(store: string, key: string): Promise<void> {
  try {
    const s = await tx(store, "readwrite");
    await new Promise<void>((res, rej) => {
      const r = s.delete(key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  } catch {}
}

export async function idbClear(store: string): Promise<void> {
  try {
    const s = await tx(store, "readwrite");
    await new Promise<void>((res, rej) => {
      const r = s.clear();
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  } catch {}
}

export const IDB_MSGS  = STORE_MSGS;
export const IDB_CONVS = STORE_CONVS;
export const IDB_KEYS  = STORE_KEYS;
