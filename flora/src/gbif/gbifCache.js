const DB_NAME = "flora35-gbif-cache";
const STORE_NAME = "pages";
const TTL_MS = 86400000; // 24 hours

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "url" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

export async function getCacheEntry(url) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry) return resolve(null);
        if (Date.now() - entry.timestamp > TTL_MS) {
          // Expired - delete it
          const deleteReq = store.delete(url);
          deleteReq.onsuccess = () => resolve(null);
          deleteReq.onerror = () => resolve(null);
          return;
        }
        resolve({ response: entry.response, timestamp: entry.timestamp });
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCacheEntry(url, response) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ url, response, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Don't fail on error
    });
  } catch {
    // Ignore errors
  }
}

export async function clearCache() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore errors
  }
}

export async function getCachedCount() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function getCacheSizeBytes() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    let total = 0;
    return new Promise((resolve) => {
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const str = JSON.stringify(cursor.value);
          total += str.length * 2; // UTF-16
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}
