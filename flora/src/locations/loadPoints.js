import { isFirebaseConfigured } from "../firebase/config";
import { loadLocationsFromFirestore } from "../firebase/loadLocationsFromFirestore";
import { findGbifFeatureByKey } from "../gbif/gbifStore";
import { findInatFeatureById } from "../inaturalist/inatStore";
import { getMergedFeatures } from "../components/addMergedLayer";
import { getRedBookFeatures } from "../components/addRedBookLayer";
import { expandFindingsToFeatures } from "./expandFindings";
import localUserpointsCollection from "./userpoints.json";

export const DATA_SOURCE_MODES = {
  NONE: "none",
  ALL: "all",
  POINTS: "points",
  USERPOINTS: "userpoints",
  EXTERNAL: "external",
  MERGED: "merged",
  REDBOOK: "redbook",
  /** @deprecated Используйте EXTERNAL */
  GBIF: "external"
};

export const DATA_SOURCE_OPTIONS = [
  {
    value: DATA_SOURCE_MODES.NONE,
    label: "Не выбран",
    title: "Карта без слоя данных"
  },
  {
    value: DATA_SOURCE_MODES.POINTS,
    label: "Проверенные",
    title: "Проверенные находки (findings)",
    hidden: true
  },
  {
    value: DATA_SOURCE_MODES.USERPOINTS,
    label: "Пользовательские",
    title: "Пользовательские находки (user_submissions)"
  },
  {
    value: DATA_SOURCE_MODES.EXTERNAL,
    label: "Внешние источники",
    title: "Данные GBIF и iNaturalist"
  },
  {
    value: DATA_SOURCE_MODES.MERGED,
    label: "Слитые точки",
    title: "Объединённые точки (merged_points)"
  },
  {
    value: DATA_SOURCE_MODES.REDBOOK,
    label: "Красная книга",
    title: "Совпадения списка редких видов (GBIF / iNat)"
  },
  {
    value: DATA_SOURCE_MODES.ALL,
    label: "Все локальные",
    title: "Проверенные и пользовательские данные",
    hidden: true
  }
];

/** Опции для селектора «Слой данных» в меню (скрытые режимы не показываются). */
export const VISIBLE_DATA_SOURCE_OPTIONS = DATA_SOURCE_OPTIONS.filter(
  (option) => !option.hidden
);

const EMPTY_SPECIES_COLLECTION = {
  type: "SpeciesCollection",
  species: []
};

let pointsCollection = EMPTY_SPECIES_COLLECTION;
let userpointsCollection = EMPTY_SPECIES_COLLECTION;
let dataSourceFilter = DATA_SOURCE_MODES.NONE;
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
  // Проверенные (findings) пока не подключаем к карте.
  void points;
  pointsCollection = EMPTY_SPECIES_COLLECTION;
  userpointsCollection = userpoints;
  invalidateFeatureCaches();
}

/** Локальный JSON — запасной источник пользовательских точек, если Firebase не настроен. */
function applyLocalJsonCollections() {
  // Проверенные (points/findings) пока не подключаем к карте.
  pointsCollection = EMPTY_SPECIES_COLLECTION;
  userpointsCollection = localUserpointsCollection;
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

/** Текущий выбранный источник данных. */
export function getDataSourceFilter() {
  return dataSourceFilter;
}

/**
 * Загружает пользовательские точки (user_submissions) из Firestore.
 * Проверенные (findings) пока не загружаются.
 * Без Firebase — подставляет локальный userpoints.json.
 * @returns {Promise<boolean>}
 */
export function initLocationsFromFirestore() {
  if (!isFirebaseConfigured()) {
    console.warn(
      "Firebase is not configured — using local userpoints.json. " +
        "Add REACT_APP_FIREBASE_* to flora/.env.local to load from Firestore."
    );
    applyLocalJsonCollections();
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
        console.warn("Falling back to local userpoints.json.");
        applyLocalJsonCollections();
        return false;
      });
  }

  return locationsInitPromise;
}

/** Повторно загружает коллекции из Firestore (например, после новой отправки). */
export function refreshLocationsFromFirestore() {
  if (!isFirebaseConfigured()) {
    applyLocalJsonCollections();
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

/** Всегда возвращает доступную локальную коллекцию (для подсказок при вводе). */
export function getAllSpeciesCollection() {
  // Проверенные пока отключены — только пользовательские.
  return userpointsCollection?.type === "SpeciesCollection"
    ? userpointsCollection
    : EMPTY_SPECIES_COLLECTION;
}

/** Возвращает коллекцию с учётом текущего фильтра источника данных. */
export function getSpeciesCollection() {
  switch (dataSourceFilter) {
    case DATA_SOURCE_MODES.POINTS:
      return pointsCollection;
    case DATA_SOURCE_MODES.USERPOINTS:
      return userpointsCollection;
    case DATA_SOURCE_MODES.NONE:
    case DATA_SOURCE_MODES.EXTERNAL:
    case DATA_SOURCE_MODES.MERGED:
    case DATA_SOURCE_MODES.REDBOOK:
    case DATA_SOURCE_MODES.GBIF:
      return EMPTY_SPECIES_COLLECTION;
    case DATA_SOURCE_MODES.ALL:
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

// Сравнение через String(), т.к. id может приходить и числом, и строкой.
function featureMatchesFindingId(feature, findingId) {
  const normalizedId = String(findingId);
  return (
    String(feature.properties?.finding_id) === normalizedId ||
    String(feature.id) === normalizedId
  );
}

function resolveGbifKeyFromFindingId(findingId) {
  const normalizedId = String(findingId);
  if (normalizedId.startsWith("gbif-")) {
    return normalizedId.slice("gbif-".length);
  }
  return normalizedId;
}

function resolveInatIdFromFindingId(findingId) {
  const normalizedId = String(findingId);
  if (normalizedId.startsWith("inat-")) {
    return normalizedId.slice("inat-".length);
  }
  return normalizedId;
}

/** Ищет точку по идентификатору находки во всех источниках данных. */
export function findFeatureByFindingId(findingId) {
  if (findingId == null || findingId === "") {
    return null;
  }

  const localFeature =
    getAllFeatureCollection().features.find((feature) =>
      featureMatchesFindingId(feature, findingId)
    ) ?? null;

  if (localFeature) {
    return localFeature;
  }

  const normalizedId = String(findingId);

  if (normalizedId.startsWith("rb-") || normalizedId.startsWith("redbook")) {
    const redBookFeature =
      getRedBookFeatures().find(
        (feature) =>
          String(feature.id ?? "") === normalizedId ||
          String(feature.properties?.redbook_match_id ?? "") === normalizedId ||
          featureMatchesFindingId(feature, findingId)
      ) ?? null;
    if (redBookFeature) {
      return redBookFeature;
    }
  }

  if (normalizedId.startsWith("merged") || normalizedId.startsWith("merged__")) {
    const mergedFeature =
      getMergedFeatures().find(
        (feature) =>
          String(feature.id ?? "") === normalizedId ||
          String(feature.properties?.merged_id ?? "") === normalizedId ||
          featureMatchesFindingId(feature, findingId)
      ) ?? null;
    if (mergedFeature) {
      return mergedFeature;
    }
  }

  if (normalizedId.startsWith("inat-")) {
    return findInatFeatureById(resolveInatIdFromFindingId(findingId));
  }

  return findGbifFeatureByKey(resolveGbifKeyFromFindingId(findingId));
}

/** Проверяет, попадает ли находка в выбранный источник данных. */
export function isFindingInDataSource(findingId, mode) {
  if (findingId == null || findingId === "") {
    return false;
  }

  const normalizedId = String(findingId);
  const gbifFeature = findGbifFeatureByKey(resolveGbifKeyFromFindingId(findingId));
  const inatFeature = findInatFeatureById(resolveInatIdFromFindingId(findingId));

  switch (mode) {
    case DATA_SOURCE_MODES.NONE:
      return false;
    case DATA_SOURCE_MODES.POINTS:
      return expandFindingsToFeatures(pointsCollection).features.some((feature) =>
        featureMatchesFindingId(feature, findingId)
      );
    case DATA_SOURCE_MODES.USERPOINTS:
      return expandFindingsToFeatures(userpointsCollection).features.some((feature) =>
        featureMatchesFindingId(feature, findingId)
      );
    case DATA_SOURCE_MODES.EXTERNAL:
    case DATA_SOURCE_MODES.GBIF:
      return Boolean(gbifFeature || inatFeature);
    case DATA_SOURCE_MODES.MERGED:
      return (
        normalizedId.startsWith("merged") ||
        normalizedId.startsWith("merged__")
      );
    case DATA_SOURCE_MODES.REDBOOK:
      return (
        normalizedId.startsWith("rb-") ||
        normalizedId.startsWith("redbook") ||
        getRedBookFeatures().some(
          (feature) =>
            String(feature.id ?? "") === normalizedId ||
            String(feature.properties?.redbook_match_id ?? "") === normalizedId ||
            featureMatchesFindingId(feature, findingId)
        )
      );
    case DATA_SOURCE_MODES.ALL:
    default:
      // «Все локальные» — только проверенные и пользовательские точки.
      return expandFindingsToFeatures(getAllSpeciesCollection()).features.some((feature) =>
        featureMatchesFindingId(feature, findingId)
      );
  }
}
