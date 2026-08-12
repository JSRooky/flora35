import { getOverlayEntry, getOverlayVersion } from "../names/nameRuCache";
import { resolveFeatureRegnum } from "./taxonFilters";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let gbifCollection = EMPTY_COLLECTION;
let loadedRegionId = null;
/** Параметры последней загрузки (для восстановления панели и повторного использования). */
let loadedQuery = null;
/** ISO-время последней полной загрузки / обновления (для инкрементального lastInterpreted). */
let syncedAt = null;

/** Кэш обогащённой коллекции: не пересчитывать enrich на каждый get. */
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

/** Накладывает overlay русских названий и единый regnum на копию GBIF feature. */
export function enrichGbifFeature(feature) {
  if (!feature?.properties || feature.properties.source !== "gbif") {
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

function buildEnrichedCollection(collection = gbifCollection) {
  return {
    type: "FeatureCollection",
    features: (collection.features ?? []).map(enrichGbifFeature)
  };
}

/** Сбрасывает кэш обогащённой коллекции (после записи store или overlay). */
export function invalidateGbifEnrichmentCache() {
  invalidateEnrichedCollectionCache();
}

/** Raw коллекция GBIF без overlay (для persist и внутренних записей). */
export function getGbifFeatureCollectionRaw() {
  return gbifCollection;
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

  enrichedCollectionCache = buildEnrichedCollection();
  enrichedCollectionOverlayVersion = overlayVersion;
  return enrichedCollectionCache;
}

/** Id региона, для которого загружены данные (или null). */
export function getGbifLoadedRegionId() {
  return loadedRegionId;
}

/** Фильтры последней успешной/сохранённой загрузки GBIF. */
export function getGbifLoadedQuery() {
  return loadedQuery;
}

/** Запоминает фильтры загрузки (царство / семейство / таксон и т.п.). */
export function setGbifLoadedQuery(query) {
  loadedQuery = query && typeof query === "object" ? query : null;
  return loadedQuery;
}

/** Время последней синхронизации с GBIF. */
export function getGbifSyncedAt() {
  return syncedAt;
}

export function setGbifSyncedAt(value) {
  syncedAt = typeof value === "string" && value ? value : null;
  return syncedAt;
}

/** Число загруженных точек. */
export function getGbifFeatureCount() {
  return gbifCollection.features.length;
}

/** Есть ли локальный набор GBIF, с которым работаем. */
export function hasGbifDataset() {
  return gbifCollection.features.length > 0;
}

/** Ищет обогащённый feature в store по gbif_key. */
export function findGbifFeatureByKey(gbifKey) {
  if (gbifKey == null || gbifKey === "") {
    return null;
  }

  const normalized = String(gbifKey);
  const feature =
    gbifCollection.features.find(
      (item) => String(item.properties?.gbif_key) === normalized
    ) ?? null;

  return feature ? enrichGbifFeature(feature) : null;
}

/** Число загруженных GBIF-точек с тем же латинским именем. */
export function countGbifFeaturesByNameLatin(nameLatin) {
  if (!nameLatin) {
    return 0;
  }

  return gbifCollection.features.filter(
    (feature) => feature.properties?.name_latin === nameLatin
  ).length;
}

/** Полностью заменяет raw коллекцию. */
export function setGbifFeatureCollection(collection, regionId = null) {
  gbifCollection = collection?.type === "FeatureCollection"
    ? collection
    : EMPTY_COLLECTION;
  loadedRegionId = regionId;
  invalidateEnrichedCollectionCache();
  return gbifCollection;
}

/** Добавляет features к текущей raw коллекции. */
export function appendGbifFeatures(features, regionId = null) {
  if (!Array.isArray(features) || features.length === 0) {
    if (regionId != null) {
      loadedRegionId = regionId;
    }
    return getGbifFeatureCollection();
  }

  gbifCollection = {
    type: "FeatureCollection",
    features: gbifCollection.features.concat(features)
  };

  if (regionId != null) {
    loadedRegionId = regionId;
  }

  invalidateEnrichedCollectionCache();
  return getGbifFeatureCollection();
}

/**
 * Вставляет/обновляет точки по gbif_key (инкрементальное обновление набора).
 * @returns {{ collection: object, added: number, updated: number }}
 */
export function upsertGbifFeatures(features, regionId = null) {
  if (!Array.isArray(features) || features.length === 0) {
    if (regionId != null) {
      loadedRegionId = regionId;
    }
    return { collection: getGbifFeatureCollection(), added: 0, updated: 0 };
  }

  const byKey = new Map();
  for (const feature of gbifCollection.features) {
    const key = feature.properties?.gbif_key;
    if (key != null && key !== "") {
      byKey.set(String(key), feature);
    }
  }

  let added = 0;
  let updated = 0;

  for (const feature of features) {
    const key = feature.properties?.gbif_key;
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

  gbifCollection = {
    type: "FeatureCollection",
    features: Array.from(byKey.values())
  };

  if (regionId != null) {
    loadedRegionId = regionId;
  }

  invalidateEnrichedCollectionCache();
  return { collection: getGbifFeatureCollection(), added, updated };
}

/** Очищает коллекцию GBIF в памяти. */
export function clearGbifStore() {
  gbifCollection = EMPTY_COLLECTION;
  loadedRegionId = null;
  loadedQuery = null;
  syncedAt = null;
  invalidateEnrichedCollectionCache();
  return gbifCollection;
}
