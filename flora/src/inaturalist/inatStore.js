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

export function getInatLoadedRegionId() {
  return loadedRegionId;
}

export function getInatLoadedRegionIds() {
  const ids = collectInatRegionIds(table);
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
  fillUniformMissingInatRegionId(table, regionId);
  idToIndex = buildInatIdIndex(table);
  if (regionId !== undefined) {
    loadedRegionId = regionId;
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
    if (regionId != null) {
      loadedRegionId = regionId;
    }
    return { collection: getInatFeatureCollectionRaw(), added: 0, updated: 0 };
  }

  stampFeatureRegionIds(features, regionId);
  const result = upsertInatFeaturesIntoTable(table, idToIndex, features);
  table = result.table;
  idToIndex = result.idToIndex;
  if (regionId != null) {
    loadedRegionId = regionId;
  }
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
  loadedQuery = null;
  syncedAt = null;
  bumpGeneration();
  return EMPTY_COLLECTION;
}

export { readInatId };
