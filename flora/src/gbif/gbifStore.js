const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let gbifCollection = EMPTY_COLLECTION;
let loadedRegionId = null;
/** Параметры последней загрузки (для восстановления панели и повторного использования). */
let loadedQuery = null;
/** ISO-время последней полной загрузки / обновления (для lastInterpreted). */
let syncedAt = null;

/** Текущая коллекция точек GBIF в памяти. */
export function getGbifFeatureCollection() {
  return gbifCollection;
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

/** Ищет feature в store по gbif_key (после клика Mapbox свойства могут быть урезанными). */
export function findGbifFeatureByKey(gbifKey) {
  if (gbifKey == null || gbifKey === "") {
    return null;
  }

  const normalized = String(gbifKey);
  return (
    gbifCollection.features.find(
      (feature) => String(feature.properties?.gbif_key) === normalized
    ) ?? null
  );
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

/** Полностью заменяет коллекцию. */
export function setGbifFeatureCollection(collection, regionId = null) {
  gbifCollection = collection?.type === "FeatureCollection"
    ? collection
    : EMPTY_COLLECTION;
  loadedRegionId = regionId;
  return gbifCollection;
}

/** Добавляет features к текущей коллекции (полная первичная загрузка). */
export function appendGbifFeatures(features, regionId = null) {
  if (!Array.isArray(features) || features.length === 0) {
    if (regionId != null) {
      loadedRegionId = regionId;
    }
    return gbifCollection;
  }

  gbifCollection = {
    type: "FeatureCollection",
    features: gbifCollection.features.concat(features)
  };

  if (regionId != null) {
    loadedRegionId = regionId;
  }

  return gbifCollection;
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
    return { collection: gbifCollection, added: 0, updated: 0 };
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

  return { collection: gbifCollection, added, updated };
}

/** Очищает коллекцию GBIF в памяти. */
export function clearGbifStore() {
  gbifCollection = EMPTY_COLLECTION;
  loadedRegionId = null;
  loadedQuery = null;
  syncedAt = null;
  return gbifCollection;
}
