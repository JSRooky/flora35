import {
  clearInatStore,
  getInatFeatureCollectionRaw,
  getInatLoadedQuery,
  getInatLoadedRegionId,
  getInatSyncedAt,
  setInatFeatureCollection,
  setInatLoadedQuery,
  setInatSyncedAt
} from "./inatStore";
import { migrateInatNameRuToOverlay } from "./migrateInatNameRuToOverlay";
import { hydrateNameRuOverlay } from "../names/nameRuCache";

const DB_NAME = "flora35-inaturalist";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
const SNAPSHOT_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open iNaturalist IndexedDB"));
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

  if (snapshot.version !== SNAPSHOT_VERSION) {
    return null;
  }

  return {
    ...snapshot,
    version: SNAPSHOT_VERSION,
    syncedAt: snapshot.syncedAt || snapshot.savedAt || null
  };
}

/** Сохраняет raw iNaturalist store (без overlay) в IndexedDB. */
export async function persistInatSnapshot() {
  const collection = getInatFeatureCollectionRaw();
  if (!isValidCollection(collection) || collection.features.length === 0) {
    await clearPersistedInatSnapshot();
    return null;
  }

  const snapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    syncedAt: getInatSyncedAt(),
    regionId: getInatLoadedRegionId(),
    query: getInatLoadedQuery(),
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
    console.warn("Failed to persist iNaturalist snapshot:", error);
    return null;
  }
}

export async function readPersistedInatSnapshot() {
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
    console.warn("Failed to read iNaturalist snapshot:", error);
    return null;
  }
}

export async function clearPersistedInatSnapshot() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await idbRequest(tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY));
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to clear iNaturalist snapshot:", error);
  }
}

/**
 * Восстанавливает iNaturalist store из IndexedDB.
 * @returns {Promise<object|null>} снимок или null
 */
export async function hydrateInatStoreFromPersistence() {
  await hydrateNameRuOverlay();

  const snapshot = await readPersistedInatSnapshot();
  if (!snapshot || snapshot.collection.features.length === 0) {
    return null;
  }

  const { collection, migrated, stripped } = await migrateInatNameRuToOverlay(
    snapshot.collection
  );

  setInatFeatureCollection(collection, snapshot.regionId ?? null);

  const restoredQuery =
    snapshot.query && typeof snapshot.query === "object"
      ? snapshot.query
      : snapshot.regionId
        ? {
            regionId: snapshot.regionId,
            qualityGrade: "research",
            kingdomId: null
          }
        : null;
  setInatLoadedQuery(restoredQuery);
  setInatSyncedAt(snapshot.syncedAt ?? null);

  if (!snapshot.query && restoredQuery) {
    await persistInatSnapshot();
  } else if (migrated > 0 || stripped > 0) {
    await persistInatSnapshot();
  }

  return {
    ...snapshot,
    collection
  };
}

export async function clearInatStoreAndPersistence() {
  clearInatStore();
  await clearPersistedInatSnapshot();
}
