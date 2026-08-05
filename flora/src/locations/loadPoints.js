import { isFirebaseConfigured } from "../firebase/config";
import { loadLocationsFromFirestore } from "../firebase/loadLocationsFromFirestore";
import { expandFindingsToFeatures } from "./expandFindings";
import { mergeSpeciesCollections } from "./mergeSpeciesCollections";

export const DATA_SOURCE_MODES = {
  ALL: "all",
  POINTS: "points",
  USERPOINTS: "userpoints"
};

export const DATA_SOURCE_OPTIONS = [
  {
    value: DATA_SOURCE_MODES.ALL,
    label: "Все",
    title: "Проверенные и пользовательские данные"
  },
  {
    value: DATA_SOURCE_MODES.POINTS,
    label: "Проверенные",
    title: "Только проверенные данные"
  },
  {
    value: DATA_SOURCE_MODES.USERPOINTS,
    label: "Пользовательские",
    title: "Только пользовательские данные"
  }
];

const EMPTY_SPECIES_COLLECTION = {
  type: "SpeciesCollection",
  species: []
};

let pointsCollection = EMPTY_SPECIES_COLLECTION;
let userpointsCollection = EMPTY_SPECIES_COLLECTION;
let dataSourceFilter = DATA_SOURCE_MODES.ALL;
let locationsInitPromise = null;

let cachedFeatureCollection = null;
let cachedFeatureCollectionMode = null;
let cachedFeaturesByNameLatin = null;
let cachedAllFeatureCollection = null;
let featureCacheVersion = 0;

function buildFeaturesByNameLatin(features) {
  const index = new Map();

  for (const feature of features) {
    const latin = feature.properties?.name_latin;
    if (!latin) {
      continue;
    }

    const speciesFeatures = index.get(latin);
    if (speciesFeatures) {
      speciesFeatures.push(feature);
    } else {
      index.set(latin, [feature]);
    }
  }

  return index;
}

function invalidateFeatureCaches() {
  cachedFeatureCollection = null;
  cachedFeatureCollectionMode = null;
  cachedFeaturesByNameLatin = null;
  cachedAllFeatureCollection = null;
  featureCacheVersion += 1;
}

/** Счётчик сброса кэша GeoJSON — для зависимых кэшей (годы и т.п.). */
export function getFeatureCacheVersion() {
  return featureCacheVersion;
}

function applyFirestoreCollections({ points, userpoints }) {
  pointsCollection = points;
  userpointsCollection = userpoints;
  invalidateFeatureCaches();
}

/** Задаёт, какие источники данных показывать на карте. */
export function setDataSourceFilter(mode) {
  if (dataSourceFilter === mode) {
    return;
  }

  dataSourceFilter = mode;
  cachedFeatureCollection = null;
  cachedFeatureCollectionMode = null;
  cachedFeaturesByNameLatin = null;
  featureCacheVersion += 1;
}

export function getDataSourceFilter() {
  return dataSourceFilter;
}

/**
 * Загружает проверенные точки (findings) и пользовательские (user_submissions) из Firestore.
 * @returns {Promise<boolean>}
 */
export function initLocationsFromFirestore() {
  if (!isFirebaseConfigured()) {
    console.warn("Firebase is not configured — location data will be empty.");
    return Promise.resolve(false);
  }

  if (!locationsInitPromise) {
    locationsInitPromise = loadLocationsFromFirestore()
      .then((collections) => {
        applyFirestoreCollections(collections);
        return true;
      })
      .catch((error) => {
        locationsInitPromise = null;
        console.warn("Failed to load locations from Firestore:", error);
        return false;
      });
  }

  return locationsInitPromise;
}

/** Повторно загружает коллекции из Firestore (например, после новой отправки). */
export function refreshLocationsFromFirestore() {
  if (!isFirebaseConfigured()) {
    return Promise.resolve(false);
  }

  return loadLocationsFromFirestore()
    .then((collections) => {
      applyFirestoreCollections(collections);
      return true;
    })
    .catch((error) => {
      console.warn("Failed to refresh locations from Firestore:", error);
      return false;
    });
}

/** Всегда возвращает объединённую коллекцию (для подсказок при вводе). */
export function getAllSpeciesCollection() {
  return mergeSpeciesCollections(pointsCollection, userpointsCollection);
}

/** Возвращает коллекцию с учётом текущего фильтра источника данных. */
export function getSpeciesCollection() {
  switch (dataSourceFilter) {
    case DATA_SOURCE_MODES.POINTS:
      return pointsCollection;
    case DATA_SOURCE_MODES.USERPOINTS:
      return userpointsCollection;
    default:
      return getAllSpeciesCollection();
  }
}

/** Разворачивает активную коллекцию в GeoJSON FeatureCollection для карты. */
export function getFeatureCollection() {
  if (cachedFeatureCollection && cachedFeatureCollectionMode === dataSourceFilter) {
    return cachedFeatureCollection;
  }

  const collection = expandFindingsToFeatures(getSpeciesCollection());
  cachedFeatureCollection = collection;
  cachedFeatureCollectionMode = dataSourceFilter;
  cachedFeaturesByNameLatin = buildFeaturesByNameLatin(collection.features);
  return collection;
}

/** Точки одного вида по латинскому названию (O(1) lookup). */
export function getFeaturesByNameLatin(nameLatin) {
  if (!nameLatin) {
    return [];
  }

  getFeatureCollection();
  return cachedFeaturesByNameLatin?.get(nameLatin) ?? [];
}

function getAllFeatureCollection() {
  if (cachedAllFeatureCollection) {
    return cachedAllFeatureCollection;
  }

  cachedAllFeatureCollection = expandFindingsToFeatures(getAllSpeciesCollection());
  return cachedAllFeatureCollection;
}

function featureMatchesFindingId(feature, findingId) {
  const normalizedId = String(findingId);
  return (
    String(feature.properties?.finding_id) === normalizedId ||
    String(feature.id) === normalizedId
  );
}

/** Ищет точку по идентификатору находки во всех источниках данных. */
export function findFeatureByFindingId(findingId) {
  if (findingId == null || findingId === "") {
    return null;
  }

  return (
    getAllFeatureCollection().features.find((feature) =>
      featureMatchesFindingId(feature, findingId)
    ) ?? null
  );
}

/** Проверяет, попадает ли находка в выбранный источник данных. */
export function isFindingInDataSource(findingId, mode) {
  if (findingId == null || findingId === "") {
    return false;
  }

  let collection;

  switch (mode) {
    case DATA_SOURCE_MODES.POINTS:
      collection = pointsCollection;
      break;
    case DATA_SOURCE_MODES.USERPOINTS:
      collection = userpointsCollection;
      break;
    default:
      collection = getAllSpeciesCollection();
      break;
  }

  return expandFindingsToFeatures(collection).features.some((feature) =>
    featureMatchesFindingId(feature, findingId)
  );
}
