import { getOverlayEntry, getOverlayVersion } from "../names/nameRuCache";
import { resolveFeatureRegnum } from "./taxonFilters";
import {
  buildGbifIdIndex,
  compactGbifTable,
  createEmptyGbifTable,
  collectGbifRegionIds,
  decodeGbifFeatures,
  encodeGbifFeatures,
  fillUniformMissingGbifRegionId,
  gbifRowToFeature,
  gbifRowToSlimFeature,
  gbifTablePackedBytes,
  hydrateGbifTable,
  readGbifKey,
  readGbifNameLatin,
  readGbifRegionId,
  upsertGbifFeaturesIntoTable
} from "./gbifColumnar";
import { stampFeatureRegionIds } from "../externalSources/regionVisibility";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let table = createEmptyGbifTable();
let idToIndex = new Map();
let loadedRegionId = null;
let loadedRegionIds = new Set();
let loadedQuery = null;
let syncedAt = null;
let storeGeneration = 0;

let rawFeaturesCache = null;
let enrichedCollectionCache = null;
let enrichedCollectionOverlayVersion = -1;
let slimMapFeaturesCache = null;
let slimMapFeaturesOverlayVersion = -1;

function bumpGeneration() {
  storeGeneration += 1;
  rawFeaturesCache = null;
  enrichedCollectionCache = null;
  enrichedCollectionOverlayVersion = -1;
  slimMapFeaturesCache = null;
  slimMapFeaturesOverlayVersion = -1;
}

function resolveRowNameRu(rowIndex) {
  const nameLatin = readGbifNameLatin(table, rowIndex);
  const overlayEntry = nameLatin ? getOverlayEntry(nameLatin) : undefined;
  return overlayEntry?.nameRu ?? null;
}

function materializeFeature(rowIndex, { raw = false } = {}) {
  const feature = gbifRowToFeature(table, rowIndex, {
    nameRu: raw ? null : resolveRowNameRu(rowIndex)
  });

  if (raw) {
    return feature;
  }

  const resolvedRegnum = resolveFeatureRegnum(feature.properties);
  if (resolvedRegnum && resolvedRegnum !== feature.properties.regnum) {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        regnum: resolvedRegnum
      }
    };
  }

  return feature;
}

/** Накладывает overlay русских названий и единый regnum на копию GBIF feature. */
export function enrichGbifFeature(feature) {
  if (!feature?.properties || feature.properties.source !== "gbif") {
    return feature;
  }

  const nameLatin = feature.properties.name_latin;
  const overlayEntry = nameLatin ? getOverlayEntry(nameLatin) : undefined;
  const effectiveNameRu = overlayEntry?.nameRu ?? feature.properties.name_ru ?? null;
  const currentNameRu = feature.properties.name_ru ?? null;
  const resolvedRegnum = resolveFeatureRegnum(feature.properties);
  const currentRegnum = feature.properties.regnum ?? null;
  const hasKingdom = feature.properties.kingdom != null && feature.properties.kingdom !== "";

  if (
    effectiveNameRu === currentNameRu &&
    resolvedRegnum === currentRegnum &&
    !hasKingdom
  ) {
    return feature;
  }

  const nextProperties = {
    ...feature.properties,
    name_ru: effectiveNameRu,
    ...(resolvedRegnum ? { regnum: resolvedRegnum } : {})
  };
  delete nextProperties.kingdom;

  return {
    ...feature,
    properties: nextProperties
  };
}

/** Сбрасывает кэш обогащённой коллекции (после записи store или overlay). */
export function invalidateGbifEnrichmentCache() {
  enrichedCollectionCache = null;
  enrichedCollectionOverlayVersion = -1;
  slimMapFeaturesCache = null;
  slimMapFeaturesOverlayVersion = -1;
}

export function getGbifStoreGeneration() {
  return storeGeneration;
}

export function getGbifColumnarTable() {
  return table;
}

export function getGbifPackedBytes() {
  return gbifTablePackedBytes(table);
}

/** Колоночная таблица, обрезанная по rowCount — для IndexedDB. */
export function getGbifPersistTable() {
  if (!table.rowCount) {
    return null;
  }
  return compactGbifTable(table);
}

/** Raw коллекция GBIF без overlay (для внутренних записей). */
export function getGbifFeatureCollectionRaw() {
  if (table.rowCount === 0) {
    return EMPTY_COLLECTION;
  }

  if (!rawFeaturesCache) {
    rawFeaturesCache = decodeGbifFeatures(table);
  }

  return {
    type: "FeatureCollection",
    features: rawFeaturesCache
  };
}

/** Коллекция GBIF с overlay русских названий (для UI, карты, инструментов). */
export function getGbifFeatureCollection() {
  const overlayVersion = getOverlayVersion();

  if (
    enrichedCollectionCache &&
    enrichedCollectionOverlayVersion === overlayVersion
  ) {
    return enrichedCollectionCache;
  }

  const features = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    features[i] = materializeFeature(i);
  }

  enrichedCollectionCache = {
    type: "FeatureCollection",
    features
  };
  enrichedCollectionOverlayVersion = overlayVersion;
  return enrichedCollectionCache;
}

/** Урезанные features для Mapbox: без полного GeoJSON store. */
export function getGbifSlimMapFeatures() {
  const overlayVersion = getOverlayVersion();
  if (slimMapFeaturesCache && slimMapFeaturesOverlayVersion === overlayVersion) {
    return slimMapFeaturesCache;
  }

  const features = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    features[i] = gbifRowToSlimFeature(table, i, {
      nameRu: resolveRowNameRu(i)
    });
  }

  slimMapFeaturesCache = features;
  slimMapFeaturesOverlayVersion = overlayVersion;
  return features;
}

export function getGbifSlimMapCollection() {
  return {
    type: "FeatureCollection",
    features: getGbifSlimMapFeatures()
  };
}

export function getGbifFeaturesByIndices(indices) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return [];
  }

  const features = new Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    features[i] = materializeFeature(indices[i]);
  }
  return features;
}

export function getGbifFeaturesForRegionIds(regionIds) {
  const wanted = new Set(
    [...(regionIds ?? [])].map((id) => String(id || "")).filter(Boolean)
  );
  if (wanted.size === 0 || table.rowCount === 0) {
    return [];
  }

  const indices = [];
  for (let i = 0; i < table.rowCount; i += 1) {
    const regionId = readGbifRegionId(table, i);
    if (regionId && wanted.has(String(regionId))) {
      indices.push(i);
    }
  }
  return getGbifFeaturesByIndices(indices);
}

function rememberLoadedRegionId(regionId) {
  if (!regionId) {
    return;
  }
  loadedRegionId = regionId;
  loadedRegionIds.add(regionId);
}

export function replaceGbifLoadedRegionIds(ids, lastId = null) {
  loadedRegionIds = new Set(
    Array.isArray(ids) ? ids.filter((id) => id != null && id !== "") : []
  );
  if (lastId) {
    loadedRegionId = lastId;
    loadedRegionIds.add(lastId);
  } else if (!loadedRegionIds.has(loadedRegionId)) {
    loadedRegionId = loadedRegionIds.size > 0 ? [...loadedRegionIds][0] : null;
  }
}

export function restoreGbifRegionsFromSnapshot(snapshot) {
  const fromTable = [...collectGbifRegionIds(table)];
  const fromSnapshot = Array.isArray(snapshot?.regionIds)
    ? snapshot.regionIds.filter(Boolean)
    : [];
  const ids = fromSnapshot.length
    ? fromSnapshot
    : fromTable.length
      ? fromTable
      : snapshot?.regionId
        ? [snapshot.regionId]
        : [];

  replaceGbifLoadedRegionIds(ids, snapshot?.regionId ?? null);

  if (fromTable.length === 0 && fromSnapshot.length === 1) {
    fillUniformMissingGbifRegionId(table, fromSnapshot[0]);
  }
}

export function getGbifLoadedRegionId() {
  return loadedRegionId;
}

export function getGbifLoadedRegionIds() {
  const ids = new Set(loadedRegionIds);
  collectGbifRegionIds(table).forEach((id) => ids.add(id));
  if (loadedRegionId) {
    ids.add(loadedRegionId);
  }
  return ids;
}

export function getGbifLoadedQuery() {
  return loadedQuery;
}

export function setGbifLoadedQuery(query) {
  loadedQuery = query && typeof query === "object" ? query : null;
  return loadedQuery;
}

export function getGbifSyncedAt() {
  return syncedAt;
}

export function setGbifSyncedAt(value) {
  syncedAt = typeof value === "string" && value ? value : null;
  return syncedAt;
}

export function getGbifFeatureCount() {
  return table.rowCount;
}

export function hasGbifDataset() {
  return table.rowCount > 0;
}

export function findGbifFeatureByKey(gbifKey) {
  if (gbifKey == null || gbifKey === "") {
    return null;
  }

  const rowIndex = idToIndex.get(String(gbifKey));
  if (rowIndex == null) {
    return null;
  }

  return materializeFeature(rowIndex);
}

export function countGbifFeaturesByNameLatin(nameLatin) {
  if (!nameLatin) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < table.rowCount; i += 1) {
    if (readGbifNameLatin(table, i) === nameLatin) {
      count += 1;
    }
  }
  return count;
}

function installTable(nextTable, regionId = null) {
  table = nextTable ?? createEmptyGbifTable();
  idToIndex = buildGbifIdIndex(table);
  if (regionId) {
    rememberLoadedRegionId(regionId);
  }
  bumpGeneration();
}

export function setGbifColumnarTable(nextTable, regionId = null) {
  installTable(hydrateGbifTable(nextTable), regionId);
  return getGbifFeatureCollectionRaw();
}

export function setGbifFeatureCollection(collection, regionId = null) {
  const features =
    collection?.type === "FeatureCollection" ? collection.features ?? [] : [];
  installTable(encodeGbifFeatures(features), regionId);
  return getGbifFeatureCollectionRaw();
}

export function appendGbifFeatures(features, regionId = null) {
  return upsertGbifFeatures(features, regionId).collection;
}

export function upsertGbifFeatures(features, regionId = null) {
  if (!Array.isArray(features) || features.length === 0) {
    rememberLoadedRegionId(regionId);
    return { collection: getGbifFeatureCollectionRaw(), added: 0, updated: 0 };
  }

  stampFeatureRegionIds(features, regionId);
  const result = upsertGbifFeaturesIntoTable(table, idToIndex, features);
  table = result.table;
  idToIndex = result.idToIndex;
  rememberLoadedRegionId(regionId);
  bumpGeneration();

  return {
    collection: getGbifFeatureCollectionRaw(),
    added: result.added,
    updated: result.updated
  };
}

export function clearGbifStore() {
  table = createEmptyGbifTable();
  idToIndex = new Map();
  loadedRegionId = null;
  loadedRegionIds = new Set();
  loadedQuery = null;
  syncedAt = null;
  bumpGeneration();
  return EMPTY_COLLECTION;
}

export function removeGbifRegionFromStore(regionId) {
  if (!regionId) {
    return { removed: false, clearedAll: false };
  }

  const tagged = collectGbifRegionIds(table);
  if (!tagged.has(regionId)) {
    if (!loadedRegionIds.has(regionId) && loadedRegionId !== regionId) {
      return { removed: false, clearedAll: false };
    }

    if (tagged.size === 0) {
      clearGbifStore();
      return { removed: true, clearedAll: true };
    }

    loadedRegionIds.delete(regionId);
    if (loadedRegionId === regionId) {
      loadedRegionId = loadedRegionIds.size > 0 ? [...loadedRegionIds][0] : null;
    }
    bumpGeneration();
    return { removed: true, clearedAll: table.rowCount === 0 };
  }

  const kept = [];
  for (let i = 0; i < table.rowCount; i += 1) {
    if (readGbifRegionId(table, i) !== regionId) {
      kept.push(gbifRowToFeature(table, i));
    }
  }

  if (kept.length === 0) {
    clearGbifStore();
    return { removed: true, clearedAll: true };
  }

  table = encodeGbifFeatures(kept);
  idToIndex = buildGbifIdIndex(table);
  loadedRegionIds.delete(regionId);
  collectGbifRegionIds(table).forEach((id) => loadedRegionIds.add(id));
  if (loadedRegionId === regionId || !loadedRegionIds.has(loadedRegionId)) {
    loadedRegionId = loadedRegionIds.size > 0 ? [...loadedRegionIds][0] : null;
  }
  bumpGeneration();
  return { removed: true, clearedAll: false };
}

export { readGbifKey };
