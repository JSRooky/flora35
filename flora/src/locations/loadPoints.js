import points from "./points.json";
import userpoints from "./userpoints.json";
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
    title: "Только данные из points.json"
  },
  {
    value: DATA_SOURCE_MODES.USERPOINTS,
    label: "Пользовательские",
    title: "Только данные из userpoints.json"
  }
];

let userpointsOverride = userpoints;
let dataSourceFilter = DATA_SOURCE_MODES.ALL;

/** Подменяет данные userpoints.json в памяти (после сохранения через API). */
export function setUserPointsCollection(collection) {
  userpointsOverride = collection;
}

/** Задаёт, какие источники данных показывать на карте. */
export function setDataSourceFilter(mode) {
  dataSourceFilter = mode;
}

export function getDataSourceFilter() {
  return dataSourceFilter;
}

/** Всегда возвращает объединённую коллекцию (для подсказок при вводе). */
export function getAllSpeciesCollection() {
  return mergeSpeciesCollections(points, userpointsOverride);
}

/** Возвращает коллекцию с учётом текущего фильтра источника данных. */
export function getSpeciesCollection() {
  switch (dataSourceFilter) {
    case DATA_SOURCE_MODES.POINTS:
      return points;
    case DATA_SOURCE_MODES.USERPOINTS:
      return userpointsOverride;
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
      collection = points;
      break;
    case DATA_SOURCE_MODES.USERPOINTS:
      collection = userpointsOverride;
      break;
    default:
      collection = getAllSpeciesCollection();
      break;
  }

  return expandFindingsToFeatures(collection).features.some((feature) =>
    featureMatchesFindingId(feature, findingId)
  );
}
