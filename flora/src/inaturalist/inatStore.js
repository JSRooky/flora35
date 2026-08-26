import { getOverlayEntry, getOverlayVersion } from "../names/nameRuCache";
import { resolveFeatureRegnum } from "../gbif/taxonFilters";
import {
  buildInatIdIndex,
  compactInatTable,
  createEmptyInatTable,
  decodeInatFeatures,
  encodeInatFeatures,
  collectInatRegionIds,
  fillUniformMissingInatRegionId,
  hydrateInatTable,
  inatRowToFeature,
  inatRowToSlimFeature,
  inatTablePackedBytes,
  readInatId,
  readInatNameLatin,
  readInatRegionId,
  upsertInatFeaturesIntoTable
} from "./inatColumnar";
import { stampFeatureRegionIds } from "../externalSources/regionVisibility";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let table = createEmptyInatTable();
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
  const nameLatin = readInatNameLatin(table, rowIndex);
  const overlayEntry = nameLatin ? getOverlayEntry(nameLatin) : undefined;
  return overlayEntry?.nameRu ?? null;
}

function materializeFeature(rowIndex, { raw = false } = {}) {
  const feature = inatRowToFeature(table, rowIndex, {
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

export function enrichInatFeature(feature) {
  if (!feature?.properties || feature.properties.source !== "inaturalist") {
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

export function invalidateInatEnrichmentCache() {
  enrichedCollectionCache = null;
  enrichedCollectionOverlayVersion = -1;
  slimMapFeaturesCache = null;
  slimMapFeaturesOverlayVersion = -1;
}

export function getInatStoreGeneration() {
  return storeGeneration;
}

export function getInatColumnarTable() {
  return table;
}

export function getInatPackedBytes() {
  return inatTablePackedBytes(table);
}

export function getInatPersistTable() {
  if (!table.rowCount) {
    return null;
  }
  return compactInatTable(table);
}

export function getInatFeatureCollectionRaw() {
  if (table.rowCount === 0) {
    return EMPTY_COLLECTION;
  }

  if (!rawFeaturesCache) {
    rawFeaturesCache = decodeInatFeatures(table);
  }

  return {
    type: "FeatureCollection",
    features: rawFeaturesCache
  };
}

export function getInatFeatureCollection() {
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

export function getInatSlimMapFeatures() {
  const overlayVersion = getOverlayVersion();
  if (slimMapFeaturesCache && slimMapFeaturesOverlayVersion === overlayVersion) {
    return slimMapFeaturesCache;
  }

  const features = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    features[i] = inatRowToSlimFeature(table, i, {
      nameRu: resolveRowNameRu(i)
    });
  }

  slimMapFeaturesCache = features;
  slimMapFeaturesOverlayVersion = overlayVersion;
  return features;
}

export function getInatSlimMapCollection() {
  return {
    type: "FeatureCollection",
    features: getInatSlimMapFeatures()
  };
}

export function getInatFeaturesByIndices(indices) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return [];
  }

  const features = new Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    features[i] = materializeFeature(indices[i]);
  }
  return features;
}

export function getInatFeaturesForRegionIds(regionIds) {
  const wanted = new Set(
    [...(regionIds ?? [])].map((id) => String(id || "")).filter(Boolean)
  );
  if (wanted.size === 0 || table.rowCount === 0) {
    return [];
  }

  const indices = [];
  for (let i = 0; i < table.rowCount; i += 1) {
    const regionId = readInatRegionId(table, i);
    if (regionId && wanted.has(String(regionId))) {
      indices.push(i);
    }
  }
  return getInatFeaturesByIndices(indices);
}

function rememberLoadedRegionId(regionId) {
  if (!regionId) {
    return;
  }
  loadedRegionId = regionId;
  loadedRegionIds.add(regionId);
}

export function replaceInatLoadedRegionIds(ids, lastId = null) {
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

export function restoreInatRegionsFromSnapshot(snapshot) {
  const fromTable = [...collectInatRegionIds(table)];
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

  replaceInatLoadedRegionIds(ids, snapshot?.regionId ?? null);

  if (fromTable.length === 0 && fromSnapshot.length === 1) {
    fillUniformMissingInatRegionId(table, fromSnapshot[0]);
  }
}

export function getInatLoadedRegionId() {
  return loadedRegionId;
}

export function getInatLoadedRegionIds() {
  const ids = new Set(loadedRegionIds);
  collectInatRegionIds(table).forEach((id) => ids.add(id));
  if (loadedRegionId) {
    ids.add(loadedRegionId);
  }
  return ids;
}

export function getInatLoadedQuery() {
  return loadedQuery;
}

export function setInatLoadedQuery(query) {
  loadedQuery = query && typeof query === "object" ? query : null;
  return loadedQuery;
}

export function getInatSyncedAt() {
  return syncedAt;
}

export function setInatSyncedAt(value) {
  syncedAt = typeof value === "string" && value ? value : null;
  return syncedAt;
}

export function getInatFeatureCount() {
  return table.rowCount;
}

/** Число загруженных точек iNaturalist по region_id. */
export function countInatFeaturesByRegionId() {
  const counts = new Map();
  for (let i = 0; i < table.rowCount; i += 1) {
    const regionId = readInatRegionId(table, i);
    if (!regionId) {
      continue;
    }
    const key = String(regionId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function hasInatDataset() {
  return table.rowCount > 0;
}

export function findInatFeatureById(inatId) {
  if (inatId == null || inatId === "") {
    return null;
  }

  const rowIndex = idToIndex.get(String(inatId));
  if (rowIndex == null) {
    return null;
  }

  return materializeFeature(rowIndex);
}

function installTable(nextTable, regionId = null) {
  table = nextTable ?? createEmptyInatTable();
  idToIndex = buildInatIdIndex(table);
  if (regionId) {
    rememberLoadedRegionId(regionId);
  }
  bumpGeneration();
}

export function setInatColumnarTable(nextTable, regionId = null) {
  installTable(hydrateInatTable(nextTable), regionId);
  return getInatFeatureCollectionRaw();
}

export function setInatFeatureCollection(collection, regionId = null) {
  const features =
    collection?.type === "FeatureCollection" ? collection.features ?? [] : [];
  installTable(encodeInatFeatures(features), regionId);
  return getInatFeatureCollectionRaw();
}

export function upsertInatFeatures(features, regionId = null) {
  if (!Array.isArray(features) || features.length === 0) {
    rememberLoadedRegionId(regionId);
    return { collection: getInatFeatureCollectionRaw(), added: 0, updated: 0 };
  }

  stampFeatureRegionIds(features, regionId);
  const result = upsertInatFeaturesIntoTable(table, idToIndex, features);
  table = result.table;
  idToIndex = result.idToIndex;
  rememberLoadedRegionId(regionId);
  bumpGeneration();

  return {
    collection: getInatFeatureCollectionRaw(),
    added: result.added,
    updated: result.updated
  };
}

export function clearInatStore() {
  table = createEmptyInatTable();
  idToIndex = new Map();
  loadedRegionId = null;
  loadedRegionIds = new Set();
  loadedQuery = null;
  syncedAt = null;
  bumpGeneration();
  return EMPTY_COLLECTION;
}

export function removeInatRegionFromStore(regionId) {
  if (!regionId) {
    return { removed: false, clearedAll: false };
  }

  const tagged = collectInatRegionIds(table);
  if (!tagged.has(regionId)) {
    if (!loadedRegionIds.has(regionId) && loadedRegionId !== regionId) {
      return { removed: false, clearedAll: false };
    }

    if (tagged.size === 0) {
      clearInatStore();
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
    if (readInatRegionId(table, i) !== regionId) {
      kept.push(inatRowToFeature(table, i));
    }
  }

  if (kept.length === 0) {
    clearInatStore();
    return { removed: true, clearedAll: true };
  }

  table = encodeInatFeatures(kept);
  idToIndex = buildInatIdIndex(table);
  loadedRegionIds.delete(regionId);
  collectInatRegionIds(table).forEach((id) => loadedRegionIds.add(id));
  if (loadedRegionId === regionId || !loadedRegionIds.has(loadedRegionId)) {
    loadedRegionId = loadedRegionIds.size > 0 ? [...loadedRegionIds][0] : null;
  }
  bumpGeneration();
  return { removed: true, clearedAll: false };
}

export { readInatId };
