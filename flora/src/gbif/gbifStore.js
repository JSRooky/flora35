const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let gbifCollection = EMPTY_COLLECTION;
let loadedRegionId = null;

/** Текущая коллекция точек GBIF в памяти. */
export function getGbifFeatureCollection() {
  return gbifCollection;
}

/** Id региона, для которого загружены данные (или null). */
export function getGbifLoadedRegionId() {
  return loadedRegionId;
}

/** Число загруженных точек. */
export function getGbifFeatureCount() {
  return gbifCollection.features.length;
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

/** Добавляет features к текущей коллекции (инкрементальная загрузка). */
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

/** Очищает коллекцию GBIF в памяти. */
export function clearGbifStore() {
  gbifCollection = EMPTY_COLLECTION;
  loadedRegionId = null;
  return gbifCollection;
}
