import { getOverlayEntry, getOverlayVersion } from "../names/nameRuCache";
import { resolveFeatureRegnum } from "./taxonFilters";
import {
  buildGbifIdIndex,
  compactGbifTable,
  createEmptyGbifTable,
  decodeGbifFeatures,
  encodeGbifFeatures,
  gbifRowToFeature,
  gbifRowToSlimFeature,
  gbifTablePackedBytes,
  collectGbifRegionIds,
  fillUniformMissingGbifRegionId,
  hydrateGbifTable,
  readGbifKey,
  readGbifNameLatin,
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

export function getGbifLoadedRegionId() {
  return loadedRegionId;
}

export function getGbifLoadedRegionIds() {
  const ids = collectGbifRegionIds(table);
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
  fillUniformMissingGbifRegionId(table, regionId);
  idToIndex = buildGbifIdIndex(table);
  if (regionId !== undefined) {
    loadedRegionId = regionId;
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
    if (regionId != null) {
      loadedRegionId = regionId;
    }
    return { collection: getGbifFeatureCollectionRaw(), added: 0, updated: 0 };
  }

  stampFeatureRegionIds(features, regionId);
  const result = upsertGbifFeaturesIntoTable(table, idToIndex, features);
  table = result.table;
  idToIndex = result.idToIndex;
  if (regionId != null) {
    loadedRegionId = regionId;
  }
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
  loadedQuery = null;
  syncedAt = null;
  bumpGeneration();
  return EMPTY_COLLECTION;
}

export { readGbifKey };
