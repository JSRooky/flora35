import {
  replaceTempLayerArchiveIndex,
  replaceTempLayers,
  serializeTempLayers,
  toArchiveIndexEntry
} from "./tempLayerStore";

const DB_NAME = "flora35-temp-layers";
const DB_VERSION = 2;
const STORE_NAME = "layers";
const ARCHIVE_STORE = "archive";
const SNAPSHOT_KEY = "all";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open temp layers IndexedDB"));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
        db.createObjectStore(ARCHIVE_STORE, { keyPath: "archiveId" });
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

export async function persistTempLayers() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    await idbRequest(tx.objectStore(STORE_NAME).put(serializeTempLayers(), SNAPSHOT_KEY));
  } finally {
    db.close();
  }
}

export async function putTempLayerArchiveRecord(record) {
  if (!record?.archiveId) {
    throw new Error("Archive record has no archiveId");
  }

  const db = await openDb();
  try {
    const tx = db.transaction(ARCHIVE_STORE, "readwrite");
    await idbRequest(tx.objectStore(ARCHIVE_STORE).put(record));
  } finally {
    db.close();
  }
}

export async function deleteTempLayerArchiveRecord(archiveId) {
  const id = String(archiveId ?? "").trim();
  if (!id) {
    return;
  }

  const db = await openDb();
  try {
    const tx = db.transaction(ARCHIVE_STORE, "readwrite");
    await idbRequest(tx.objectStore(ARCHIVE_STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function getTempLayerArchiveRecord(archiveId) {
  const id = String(archiveId ?? "").trim();
  if (!id) {
    return null;
  }

  const db = await openDb();
  try {
    const tx = db.transaction(ARCHIVE_STORE, "readonly");
    const record = await idbRequest(tx.objectStore(ARCHIVE_STORE).get(id));
    return record || null;
  } finally {
    db.close();
  }
}

async function loadArchiveIndex(db) {
  if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
    replaceTempLayerArchiveIndex([]);
    return [];
  }

  const tx = db.transaction(ARCHIVE_STORE, "readonly");
  const records = await idbRequest(tx.objectStore(ARCHIVE_STORE).getAll());
  const index = (Array.isArray(records) ? records : [])
    .filter((record) => record?.archiveId)
    .map((record) => toArchiveIndexEntry(record))
    .sort((left, right) =>
      String(right.archivedAt || "").localeCompare(String(left.archivedAt || ""))
    );
  replaceTempLayerArchiveIndex(index);
  return index;
}

export async function refreshTempLayerArchiveIndex() {
  const db = await openDb();
  try {
    return await loadArchiveIndex(db);
  } finally {
    db.close();
  }
}

/** Полностью очищает временные слои (в т.ч. архив) в памяти и в IndexedDB. */
export async function clearAllTempLayersAndPersistence() {
  replaceTempLayers([]);
  replaceTempLayerArchiveIndex([]);

  if (typeof indexedDB === "undefined") {
    return;
  }

  try {
    const db = await openDb();
    try {
      await idbRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear());
      if (db.objectStoreNames.contains(ARCHIVE_STORE)) {
        await idbRequest(db.transaction(ARCHIVE_STORE, "readwrite").objectStore(ARCHIVE_STORE).clear());
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Failed to clear temp layers IndexedDB:", error);
  }
}

export async function hydrateTempLayersFromPersistence() {
  if (typeof indexedDB === "undefined") {
    replaceTempLayers([]);
    replaceTempLayerArchiveIndex([]);
    return [];
  }

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const snapshot = await idbRequest(tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY));
      const layers = Array.isArray(snapshot) ? snapshot : [];
      replaceTempLayers(layers);
      await loadArchiveIndex(db);
      return layers;
    } finally {
      db.close();
    }
  } catch {
    replaceTempLayers([]);
    replaceTempLayerArchiveIndex([]);
    return [];
  }
}
