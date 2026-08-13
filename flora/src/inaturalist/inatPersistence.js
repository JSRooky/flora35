import {
  clearInatStore,
  getInatLoadedQuery,
  getInatLoadedRegionId,
  getInatPersistTable,
  getInatSyncedAt,
  setInatColumnarTable,
  setInatFeatureCollection,
  setInatLoadedQuery,
  setInatSyncedAt
} from "./inatStore";
import { INAT_COLUMNAR_VERSION } from "./inatColumnar";
import { migrateInatNameRuToOverlay } from "./migrateInatNameRuToOverlay";
import { hydrateNameRuOverlay } from "../names/nameRuCache";
import { COLUMNAR_FORMAT } from "../externalSources/columnarSnapshot";

const DB_NAME = "flora35-inaturalist";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
const SNAPSHOT_VERSION = INAT_COLUMNAR_VERSION;

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
  return snapshot && isValidCollection(snapshot.collection) && snapshot.version === 1;
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

  return snapshot.regionId
    ? {
        regionId: snapshot.regionId,
        qualityGrade: "research",
        kingdomId: null
      }
    : null;
}

function applySnapshotMeta(snapshot, restoredQuery) {
  setInatLoadedQuery(restoredQuery);
  setInatSyncedAt(snapshot.syncedAt ?? null);
}

/** Сохраняет колоночный iNaturalist store в IndexedDB. */
export async function persistInatSnapshot() {
  const table = getInatPersistTable();
  if (!table || table.rowCount === 0) {
    await clearPersistedInatSnapshot();
    return null;
  }

  const snapshot = {
    version: SNAPSHOT_VERSION,
    format: COLUMNAR_FORMAT,
    savedAt: new Date().toISOString(),
    syncedAt: getInatSyncedAt(),
    regionId: getInatLoadedRegionId(),
    query: getInatLoadedQuery(),
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
  if (!snapshot) {
    return null;
  }

  if (snapshot.format === COLUMNAR_FORMAT) {
    if (!snapshot.rowCount) {
      return null;
    }

    setInatColumnarTable(snapshot.table, snapshot.regionId ?? null);
    const restoredQuery = restoreQuery(snapshot);
    applySnapshotMeta(snapshot, restoredQuery);

    return snapshot;
  }

  if (!snapshot.collection?.features?.length) {
    return null;
  }

  const { collection, migrated, stripped } = await migrateInatNameRuToOverlay(
    snapshot.collection
  );

  setInatFeatureCollection(collection, snapshot.regionId ?? null);

  const restoredQuery = restoreQuery(snapshot);
  applySnapshotMeta(snapshot, restoredQuery);

  if (!snapshot.query && restoredQuery) {
    await persistInatSnapshot();
  } else if (migrated > 0 || stripped > 0 || snapshot.format === "geojson") {
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
