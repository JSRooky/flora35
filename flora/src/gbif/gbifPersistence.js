import {
  clearGbifStore,
  getGbifLoadedRegionId,
  getGbifLoadedQuery,
  getGbifLoadedRegionIds,
  getGbifPersistTable,
  getGbifSyncedAt,
  restoreGbifRegionsFromSnapshot,
  setGbifColumnarTable,
  setGbifFeatureCollection,
  setGbifLoadedQuery,
  setGbifSyncedAt
} from "./gbifStore";
import { GBIF_COLUMNAR_VERSION } from "./gbifColumnar";
import { migrateGbifNameRuToOverlay } from "./migrateGbifNameRuToOverlay";
import { hydrateNameRuOverlay } from "../names/nameRuCache";
import { COLUMNAR_FORMAT } from "../externalSources/columnarSnapshot";

const DB_NAME = "flora35-gbif";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
const SNAPSHOT_VERSION = GBIF_COLUMNAR_VERSION;

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

function isColumnarSnapshot(snapshot) {
  return (
    snapshot &&
    snapshot.format === COLUMNAR_FORMAT &&
    snapshot.version === SNAPSHOT_VERSION &&
    snapshot.table &&
    typeof snapshot.rowCount === "number"
  );
}

function isLegacyGeoJsonSnapshot(snapshot) {
  return (
    snapshot &&
    isValidCollection(snapshot.collection) &&
    (snapshot.version === 1 || snapshot.version === 2)
  );
}

function normalizeSnapshot(snapshot) {
  if (isColumnarSnapshot(snapshot)) {
    return {
      ...snapshot,
      syncedAt: snapshot.syncedAt || snapshot.savedAt || null
    };
  }

  if (!isLegacyGeoJsonSnapshot(snapshot)) {
    return null;
  }

  return {
    ...snapshot,
    format: "geojson",
    syncedAt: snapshot.syncedAt || snapshot.savedAt || null
  };
}

function restoreQuery(snapshot) {
  if (snapshot.query && typeof snapshot.query === "object") {
    return snapshot.query;
  }

  return snapshot.regionId ? { regionId: snapshot.regionId, kingdomId: null } : null;
}

function applySnapshotMeta(snapshot, restoredQuery) {
  setGbifLoadedQuery(restoredQuery);
  setGbifSyncedAt(snapshot.syncedAt ?? null);
}

/** Сохраняет колоночный GBIF store в IndexedDB. */
export async function persistGbifSnapshot() {
  const table = getGbifPersistTable();
  if (!table || table.rowCount === 0) {
    await clearPersistedGbifSnapshot();
    return null;
  }

  const snapshot = {
    version: SNAPSHOT_VERSION,
    format: COLUMNAR_FORMAT,
    savedAt: new Date().toISOString(),
    syncedAt: getGbifSyncedAt(),
    regionId: getGbifLoadedRegionId(),
    regionIds: [...getGbifLoadedRegionIds()],
    query: getGbifLoadedQuery(),
    rowCount: table.rowCount,
    table
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
  if (!snapshot) {
    return null;
  }

  if (snapshot.format === COLUMNAR_FORMAT) {
    if (!snapshot.rowCount) {
      return null;
    }

    setGbifColumnarTable(snapshot.table, null);
    restoreGbifRegionsFromSnapshot(snapshot);
    const restoredQuery = restoreQuery(snapshot);
    applySnapshotMeta(snapshot, restoredQuery);

    return snapshot;
  }

  if (!snapshot.collection?.features?.length) {
    return null;
  }

  const { collection, migrated, stripped } = await migrateGbifNameRuToOverlay(
    snapshot.collection
  );

  setGbifFeatureCollection(collection, snapshot.regionId ?? null);
  restoreGbifRegionsFromSnapshot(snapshot);

  const restoredQuery = restoreQuery(snapshot);
  applySnapshotMeta(snapshot, restoredQuery);

  if (!snapshot.query && restoredQuery) {
    await persistGbifSnapshot();
  } else if (migrated > 0 || stripped > 0 || snapshot.format === "geojson") {
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
