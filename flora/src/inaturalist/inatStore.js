import { getOverlayEntry, getOverlayVersion } from "../names/nameRuCache";
import { resolveFeatureRegnum } from "../gbif/taxonFilters";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let inatCollection = EMPTY_COLLECTION;
let loadedRegionId = null;
let loadedQuery = null;
let syncedAt = null;

let enrichedCollectionCache = null;
let enrichedCollectionOverlayVersion = -1;

function invalidateEnrichedCollectionCache() {
  enrichedCollectionCache = null;
  enrichedCollectionOverlayVersion = -1;
}

function resolveEffectiveNameRu(feature) {
  const nameLatin = feature?.properties?.name_latin;
  const overlayEntry = nameLatin ? getOverlayEntry(nameLatin) : undefined;

  if (overlayEntry?.nameRu) {
    return overlayEntry.nameRu;
  }

  return feature?.properties?.name_ru ?? null;
}

export function enrichInatFeature(feature) {
  if (!feature?.properties || feature.properties.source !== "inaturalist") {
    return feature;
  }

  const effectiveNameRu = resolveEffectiveNameRu(feature);
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

function buildEnrichedCollection(collection = inatCollection) {
  return {
    type: "FeatureCollection",
    features: (collection.features ?? []).map(enrichInatFeature)
  };
}

export function invalidateInatEnrichmentCache() {
  invalidateEnrichedCollectionCache();
}

export function getInatFeatureCollectionRaw() {
  return inatCollection;
}

export function getInatFeatureCollection() {
  const overlayVersion = getOverlayVersion();

  if (
    enrichedCollectionCache &&
    enrichedCollectionOverlayVersion === overlayVersion
  ) {
    return enrichedCollectionCache;
  }

  enrichedCollectionCache = buildEnrichedCollection();
  enrichedCollectionOverlayVersion = overlayVersion;
  return enrichedCollectionCache;
}

export function getInatLoadedRegionId() {
  return loadedRegionId;
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
  return inatCollection.features.length;
}

export function hasInatDataset() {
  return inatCollection.features.length > 0;
}

export function findInatFeatureById(inatId) {
  if (inatId == null || inatId === "") {
    return null;
  }

  const normalized = String(inatId);
  const feature =
    inatCollection.features.find(
      (item) => String(item.properties?.inat_id) === normalized
    ) ?? null;

  return feature ? enrichInatFeature(feature) : null;
}

export function setInatFeatureCollection(collection, regionId = null) {
  inatCollection = collection?.type === "FeatureCollection"
    ? collection
    : EMPTY_COLLECTION;
  loadedRegionId = regionId;
  invalidateEnrichedCollectionCache();
  return inatCollection;
}

export function upsertInatFeatures(features, regionId = null) {
  if (!Array.isArray(features) || features.length === 0) {
    if (regionId != null) {
      loadedRegionId = regionId;
    }
    return { collection: getInatFeatureCollection(), added: 0, updated: 0 };
  }

  const byKey = new Map();
  for (const feature of inatCollection.features) {
    const key = feature.properties?.inat_id;
    if (key != null && key !== "") {
      byKey.set(String(key), feature);
    }
  }

  let added = 0;
  let updated = 0;

  for (const feature of features) {
    const key = feature.properties?.inat_id;
    if (key == null || key === "") {
      continue;
    }

    const normalized = String(key);
    if (byKey.has(normalized)) {
      updated += 1;
    } else {
      added += 1;
    }
    byKey.set(normalized, feature);
  }

  inatCollection = {
    type: "FeatureCollection",
    features: Array.from(byKey.values())
  };

  if (regionId != null) {
    loadedRegionId = regionId;
  }

  invalidateEnrichedCollectionCache();
  return { collection: getInatFeatureCollection(), added, updated };
}

export function clearInatStore() {
  inatCollection = EMPTY_COLLECTION;
  loadedRegionId = null;
  loadedQuery = null;
  syncedAt = null;
  invalidateEnrichedCollectionCache();
  return inatCollection;
}
