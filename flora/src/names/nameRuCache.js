import { nameLatinCacheKey } from "./vernacularUtils";

const DB_NAME = "flora35-name-ru";
const DB_VERSION = 1;
const STORE_NAME = "entries";

/** @type {Map<string, { nameRu: string|null, source: string|null, resolvedAt: string }>} */
const memoryCache = new Map();
let hydrated = false;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open name-ru IndexedDB"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    nameRu: entry.nameRu ?? null,
    source: entry.source ?? null,
    resolvedAt: entry.resolvedAt ?? null
  };
}

function cacheKey(nameLatin) {
  return nameLatinCacheKey(nameLatin);
}

/** Загружает все записи overlay из IndexedDB в память (вызывать при старте приложения). */
export async function hydrateNameRuOverlay() {
  memoryCache.clear();
  hydrated = false;

  if (typeof indexedDB === "undefined") {
    hydrated = true;
    return 0;
  }

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const entries = await idbRequest(store.getAll());
      const keys = await idbRequest(store.getAllKeys());

      keys.forEach((key, index) => {
        const entry = normalizeEntry(entries[index]);
        if (entry) {
          memoryCache.set(String(key), entry);
        }
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to hydrate name-ru overlay:", error);
  }

  hydrated = true;
  return memoryCache.size;
}

/** Sync: запись overlay по латинскому имени (undefined если нет). */
export function getOverlayEntry(nameLatin) {
  const key = cacheKey(nameLatin);
  if (!key) {
    return undefined;
  }

  return memoryCache.get(key);
}

/** Sync: русское имя из overlay (только если найдено, иначе null). */
export function getOverlayRussianName(nameLatin) {
  const entry = getOverlayEntry(nameLatin);
  return entry?.nameRu ?? null;
}

/** Sync: есть ли запись overlay (в т.ч. отрицательная). */
export function hasOverlayEntry(nameLatin) {
  const key = cacheKey(nameLatin);
  return Boolean(key && memoryCache.has(key));
}

/** Читает закэшированный результат (memory → IndexedDB). */
export async function getCachedRussianName(nameLatin) {
  const key = cacheKey(nameLatin);
  if (!key) {
    return null;
  }

  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const entry = normalizeEntry(await idbRequest(tx.objectStore(STORE_NAME).get(key)));
      if (entry) {
        memoryCache.set(key, entry);
      }
      return entry;
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to read name-ru cache:", error);
    return null;
  }
}

/** Сохраняет результат поиска (в т.ч. отрицательный). */
export async function setCachedRussianName(nameLatin, { nameRu, source = null } = {}) {
  const key = cacheKey(nameLatin);
  if (!key) {
    return null;
  }

  const entry = {
    nameRu: nameRu ?? null,
    source: source ?? null,
    resolvedAt: new Date().toISOString()
  };

  memoryCache.set(key, entry);

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await idbRequest(tx.objectStore(STORE_NAME).put(entry, key));
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to persist name-ru cache:", error);
  }

  return entry;
}

/** Удаляет запись overlay (выбранное имя или «не найдено»). */
export async function clearCachedRussianName(nameLatin) {
  const key = cacheKey(nameLatin);
  if (!key) {
    return false;
  }

  memoryCache.delete(key);

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await idbRequest(tx.objectStore(STORE_NAME).delete(key));
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to clear name-ru cache:", error);
  }

  return true;
}

/** Sync: seed overlay в память без записи в IDB (для миграции перед batch persist). */
export function seedOverlayInMemory(nameLatin, { nameRu, source = null } = {}) {
  const key = cacheKey(nameLatin);
  if (!key || memoryCache.has(key)) {
    return null;
  }

  const entry = {
    nameRu: nameRu ?? null,
    source: source ?? null,
    resolvedAt: new Date().toISOString()
  };

  memoryCache.set(key, entry);
  return entry;
}

export function isNameRuOverlayHydrated() {
  return hydrated;
}
