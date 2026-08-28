import {
  replaceTempLayerArchiveIndex,
  replaceArchivedRegionOverlayFeatures,
  collectArchivedRegionOverlayFeatures,
  replaceTempLayers,
  mergePersistedRegionTempLayers,
  serializeTempLayers,
  summarizeTempLayerSettings,
  toArchiveIndexEntry,
  canPersistTempLayersSafely,
  isRegionTempLayer
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
    const store = tx.objectStore(STORE_NAME);
    if (canPersistTempLayersSafely()) {
      await idbRequest(store.put(serializeTempLayers(), SNAPSHOT_KEY));
      return;
    }
    const existing = await idbRequest(store.get(SNAPSHOT_KEY));
    const current = Array.isArray(existing) ? existing : [];
    const regionLayers = serializeTempLayers().filter((layer) => isRegionTempLayer(layer));
    const rest = current.filter((layer) => !isRegionTempLayer(layer));
    await idbRequest(store.put([...regionLayers, ...rest], SNAPSHOT_KEY));
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
    replaceArchivedRegionOverlayFeatures([]);
    return [];
  }

  const tx = db.transaction(ARCHIVE_STORE, "readonly");
  const rawRecords = await idbRequest(tx.objectStore(ARCHIVE_STORE).getAll());
  const records = (Array.isArray(rawRecords) ? rawRecords : []).filter(
    (record) => record?.archiveId
  );
  const index = records
    .map((record) => toArchiveIndexEntry(record))
    .sort((left, right) =>
      String(right.archivedAt || "").localeCompare(String(left.archivedAt || ""))
    );
  replaceTempLayerArchiveIndex(index);
  replaceArchivedRegionOverlayFeatures(collectArchivedRegionOverlayFeatures(records));
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

export async function getAllTempLayerArchiveRecords() {
  if (typeof indexedDB === "undefined") {
    return [];
  }

  const db = await openDb();
  try {
    if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
      return [];
    }
    const tx = db.transaction(ARCHIVE_STORE, "readonly");
    const records = await idbRequest(tx.objectStore(ARCHIVE_STORE).getAll());
    return Array.isArray(records) ? records.filter((record) => record?.archiveId) : [];
  } finally {
    db.close();
  }
}

export async function replaceAllTempLayerArchiveRecords(records) {
  const next = Array.isArray(records) ? records.filter((record) => record?.archiveId) : [];
  const db = await openDb();
  try {
    if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to replace archive records"));
      const store = tx.objectStore(ARCHIVE_STORE);
      store.clear();
      next.forEach((record) => {
        store.put(record);
      });
    });
  } finally {
    db.close();
  }
}

export async function snapshotTempWorkspace() {
  if (canPersistTempLayersSafely()) {
    await persistTempLayers();
  }
  return {
    layers: serializeTempLayers(),
    archive: await getAllTempLayerArchiveRecords()
  };
}

export async function snapshotTempSettings() {
  const archive = await getAllTempLayerArchiveRecords();
  return {
    layers: serializeTempLayers().map((layer) => summarizeTempLayerSettings(layer)),
    archive: archive.map((record) => ({
      archiveId: record.archiveId,
      groupKey: record.groupKey ?? null,
      title: record.title || "Временный слой",
      markerColor: record.markerColor ?? null,
      createdAt: record.createdAt ?? null,
      archivedAt: record.archivedAt ?? null,
      updatedAt: record.updatedAt ?? record.archivedAt ?? null,
      pointCount: (Array.isArray(record.layers) ? record.layers : []).reduce(
        (sum, layer) => sum + (layer.features?.length ?? layer.pointCount ?? 0),
        0
      ),
      layers: (Array.isArray(record.layers) ? record.layers : []).map((layer) =>
        summarizeTempLayerSettings(layer)
      )
    }))
  };
}

export async function applyArchiveSettingsMeta(entries) {
  const metas = Array.isArray(entries) ? entries : [];
  for (const entry of metas) {
    const id = String(entry?.archiveId ?? "").trim();
    if (!id) {
      continue;
    }
    const record = await getTempLayerArchiveRecord(id);
    if (!record) {
      continue;
    }
    const layerMetas = Array.isArray(entry.layers) ? entry.layers : [];
    await putTempLayerArchiveRecord({
      ...record,
      title: entry.title || record.title,
      markerColor: entry.markerColor !== undefined ? entry.markerColor : record.markerColor,
      updatedAt: entry.updatedAt || new Date().toISOString(),
      layers: (Array.isArray(record.layers) ? record.layers : []).map((layer) => {
        const meta =
          layerMetas.find((item) => item?.id && item.id === layer.id) ||
          layerMetas.find((item) => item?.source && item.source === layer.source);
        if (!meta) {
          return layer;
        }
        return {
          ...layer,
          label: meta.label || layer.label,
          taxonName: meta.taxonName ?? layer.taxonName,
          visible: typeof meta.visible === "boolean" ? meta.visible : layer.visible,
          heatmapEnabled:
            typeof meta.heatmapEnabled === "boolean" ? meta.heatmapEnabled : layer.heatmapEnabled,
          markerColor: meta.markerColor !== undefined ? meta.markerColor : layer.markerColor
        };
      })
    });
  }
  await refreshTempLayerArchiveIndex();
}

export async function restoreTempWorkspace(snapshot = {}) {
  replaceTempLayers(Array.isArray(snapshot.layers) ? snapshot.layers : []);
  await persistTempLayers();
  await replaceAllTempLayerArchiveRecords(snapshot.archive);
  await refreshTempLayerArchiveIndex();
}

export async function hydrateTempLayersFromPersistence() {
  if (typeof indexedDB === "undefined") {
    replaceTempLayers([]);
    replaceTempLayerArchiveIndex([]);
    replaceArchivedRegionOverlayFeatures([]);
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
    replaceArchivedRegionOverlayFeatures([]);
    return [];
  }
}

export async function hydrateRegionOverlaysFromPersistence() {
  if (typeof indexedDB === "undefined") {
    return [];
  }
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const snapshot = await idbRequest(tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY));
      const layers = Array.isArray(snapshot) ? snapshot : [];
      mergePersistedRegionTempLayers(layers.filter((layer) => isRegionTempLayer(layer)));
      return layers.filter((layer) => isRegionTempLayer(layer));
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}
