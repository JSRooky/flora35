import points from "./points.json";
import userpoints from "./userpoints.json";
import { isFirebaseConfigured } from "../firebase/config";
import { loadLocationsFromFirestore } from "../firebase/loadLocationsFromFirestore";
import { slugifySpeciesId } from "../firebase/speciesCollectionFirestore";
import { DEFAULT_SPECIES_DESCRIPTION_MD } from "./defaultSpeciesDescription";
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

let pointsCollection = points;
let userpointsCollection = userpoints;
let dataSourceFilter = DATA_SOURCE_MODES.ALL;
let locationsInitPromise = null;
let locationsLoadedFromFirestore = false;

function shouldLoadFirestoreLocations() {
  return (
    isFirebaseConfigured() && process.env.REACT_APP_USE_FIRESTORE_LOCATIONS === "true"
  );
}

function applyFirestoreCollections({ points, userpoints }) {
  pointsCollection = points;
  userpointsCollection = userpoints;
  locationsLoadedFromFirestore = true;
}

/**
 * Добавляет пользовательскую находку в in-memory коллекцию userpoints.
 * @returns {object} обновлённая SpeciesCollection
 */
export function appendUserSubmission(payload, findingId) {
  const speciesId = slugifySpeciesId(payload.name_latin);
  const finding = {
    id: findingId,
    coordinates: payload.coordinates,
    found_by: payload.found_by,
    identified_by: payload.identified_by ?? "",
    found_year: payload.found_year
  };

  const existingSpecies = userpointsCollection.species.find((species) => species.id === speciesId);

  if (existingSpecies) {
    userpointsCollection = {
      type: "SpeciesCollection",
      species: userpointsCollection.species.map((species) =>
        species.id === speciesId
          ? {
              ...species,
              description_md: species.description_md ?? DEFAULT_SPECIES_DESCRIPTION_MD,
              findings: [...species.findings, finding]
            }
          : species
      )
    };
  } else {
    userpointsCollection = {
      type: "SpeciesCollection",
      species: [
        ...userpointsCollection.species,
        {
          id: speciesId,
          regnum: payload.regnum,
          status: payload.status,
          family: payload.family,
          name_ru: payload.name_ru,
          name_latin: payload.name_latin,
          description_md: DEFAULT_SPECIES_DESCRIPTION_MD,
          findings: [finding]
        }
      ]
    };
  }

  return userpointsCollection;
}

/** Подменяет данные userpoints в памяти (после сохранения через API или Firebase). */
export function setUserPointsCollection(collection) {
  userpointsCollection = collection;
}

/** Подменяет проверенные данные points в памяти. */
export function setPointsCollection(collection) {
  pointsCollection = collection;
}

/** Задаёт, какие источники данных показывать на карте. */
export function setDataSourceFilter(mode) {
  dataSourceFilter = mode;
}

export function getDataSourceFilter() {
  return dataSourceFilter;
}

export function isLocationsLoadedFromFirestore() {
  return locationsLoadedFromFirestore;
}

/**
 * Загружает проверенные точки (findings) и пользовательские (user_submissions) из Firestore,
 * если включено REACT_APP_USE_FIRESTORE_LOCATIONS.
 * @returns {Promise<boolean>}
 */
export function initLocationsFromFirestore() {
  if (!shouldLoadFirestoreLocations()) {
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
  if (!shouldLoadFirestoreLocations()) {
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
  return expandFindingsToFeatures(getSpeciesCollection());
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
    expandFindingsToFeatures(getAllSpeciesCollection()).features.find((feature) =>
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
