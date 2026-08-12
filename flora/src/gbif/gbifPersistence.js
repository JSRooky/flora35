import {
  clearGbifStore,
  getGbifFeatureCollectionRaw,
  getGbifLoadedRegionId,
  getGbifLoadedQuery,
  getGbifSyncedAt,
  setGbifFeatureCollection,
  setGbifLoadedQuery,
  setGbifSyncedAt
} from "./gbifStore";
import { migrateGbifNameRuToOverlay } from "./migrateGbifNameRuToOverlay";
import { hydrateNameRuOverlay } from "../names/nameRuCache";

const DB_NAME = "flora35-gbif";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
const SNAPSHOT_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open GBIF IndexedDB"));
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

function isValidCollection(collection) {
  return (
    collection &&
    collection.type === "FeatureCollection" &&
    Array.isArray(collection.features)
  );
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || !isValidCollection(snapshot.collection)) {
    return null;
  }

  // v1 не хранил syncedAt — берём savedAt.
  if (snapshot.version !== 1 && snapshot.version !== SNAPSHOT_VERSION) {
    return null;
  }

  return {
    ...snapshot,
    version: SNAPSHOT_VERSION,
    syncedAt: snapshot.syncedAt || snapshot.savedAt || null
  };
}

/** Сохраняет raw GBIF store (без overlay) в IndexedDB. */
export async function persistGbifSnapshot() {
  const collection = getGbifFeatureCollectionRaw();
  if (!isValidCollection(collection) || collection.features.length === 0) {
    await clearPersistedGbifSnapshot();
    return null;
  }

  const snapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    syncedAt: getGbifSyncedAt(),
    regionId: getGbifLoadedRegionId(),
    query: getGbifLoadedQuery(),
    collection
  };

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await idbRequest(tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY));
    } finally {
      db.close();
    }
    return snapshot;
  } catch (error) {
    console.warn("Failed to persist GBIF snapshot:", error);
    return null;
  }
}

/** Читает снимок GBIF из IndexedDB (без применения к store). */
export async function readPersistedGbifSnapshot() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const snapshot = await idbRequest(tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY));
      return normalizeSnapshot(snapshot);
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to read GBIF snapshot:", error);
    return null;
  }
}

/** Удаляет сохранённый снимок GBIF. */
export async function clearPersistedGbifSnapshot() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await idbRequest(tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY));
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to clear GBIF snapshot:", error);
  }
}

/**
 * Восстанавливает GBIF store из IndexedDB.
 * @returns {Promise<object|null>} снимок или null
 */
export async function hydrateGbifStoreFromPersistence() {
  await hydrateNameRuOverlay();

  const snapshot = await readPersistedGbifSnapshot();
  if (!snapshot || snapshot.collection.features.length === 0) {
    return null;
  }

  const { collection, migrated, stripped } = await migrateGbifNameRuToOverlay(
    snapshot.collection
  );

  setGbifFeatureCollection(collection, snapshot.regionId ?? null);

  const restoredQuery =
    snapshot.query && typeof snapshot.query === "object"
      ? snapshot.query
      : snapshot.regionId
        ? { regionId: snapshot.regionId, kingdomId: null }
        : null;
  setGbifLoadedQuery(restoredQuery);
  setGbifSyncedAt(snapshot.syncedAt ?? null);

  // Старые снимки без query — допишем синтетический, чтобы «Обновить» работал.
  if (!snapshot.query && restoredQuery) {
    await persistGbifSnapshot();
  } else if (migrated > 0 || stripped > 0) {
    await persistGbifSnapshot();
  }

  return {
    ...snapshot,
    collection
  };
}

/** Очищает store в памяти и снимок в IndexedDB. */
export async function clearGbifStoreAndPersistence() {
  clearGbifStore();
  await clearPersistedGbifSnapshot();
}
