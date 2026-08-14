import { replaceTempLayers, serializeTempLayers } from "./tempLayerStore";

const DB_NAME = "flora35-temp-layers";
const DB_VERSION = 1;
const STORE_NAME = "layers";
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

export async function hydrateTempLayersFromPersistence() {
  if (typeof indexedDB === "undefined") {
    return [];
  }

  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const snapshot = await idbRequest(tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY));
      const layers = Array.isArray(snapshot) ? snapshot : [];
      replaceTempLayers(layers);
      return layers;
    } finally {
      db.close();
    }
  } catch {
    replaceTempLayers([]);
    return [];
  }
}
