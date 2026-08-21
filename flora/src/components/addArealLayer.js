import maplibregl from "../map/mapEngine";
import { circle } from "@turf/turf";
import { getHaversineDistanceKm } from "../geo/getHaversineDistanceKm";
import {
  getToolFeatures,
  getPointColorForRegnum,
  getUnclusteredFeatures,
  featureMatchesFilters,
  isFeatureUnclusteredOnMap
} from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

export { getHaversineDistanceKm };
/** Порог (~1 м): ближе считаем той же точкой, что и центр ареала. */
const SAME_POINT_THRESHOLD_KM = 0.001;
/** Допуск для сопоставления точки с карты с записью в dataset. */
const CENTER_MATCH_THRESHOLD_KM = 0.05;
const AREAL_HINT_VISIBLE_MS = 2000;

let arealPointHintPopup = null;
let arealPointHintHideTimer = null;
let arealPointHintTarget = null;
let arealPointHintGeneration = 0;

function isCoordinatePair(value) {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number";
}

function isCenterPoint(feature, centerFeature) {
  const center = centerFeature?.geometry?.coordinates;
  const coordinates = feature?.geometry?.coordinates;
  if (!center || !coordinates) {
    return false;
  }

  const distanceKm = getHaversineDistanceKm(center, coordinates);
  const featureProps = feature.properties ?? {};
  const centerProps = centerFeature.properties ?? {};

  if (
    centerProps.name_latin &&
    featureProps.name_latin === centerProps.name_latin &&
    (centerProps.name_ru == null ||
      featureProps.name_ru == null ||
      featureProps.name_ru === centerProps.name_ru) &&
    (centerProps.found_year == null ||
      featureProps.found_year == null ||
      featureProps.found_year === centerProps.found_year) &&
    distanceKm <= CENTER_MATCH_THRESHOLD_KM
  ) {
    return true;
  }

  if (distanceKm > SAME_POINT_THRESHOLD_KM) {
    return false;
  }

  if (
    featureProps.name_latin &&
    centerProps.name_latin &&
    featureProps.name_latin !== centerProps.name_latin
  ) {
    return false;
  }

  if (
    featureProps.name_ru &&
    centerProps.name_ru &&
    featureProps.name_ru !== centerProps.name_ru
  ) {
    return false;
  }

  return true;
}

/** Находит запись из набора данных, соответствующую выбранной на карте точке. */
function resolveCenterFeature(centerFeature, filters = {}) {
  const center = centerFeature?.geometry?.coordinates;
  if (!center) {
    return null;
  }

  const candidates = getToolFeatures(filters);
  const matchedByIdentity = candidates.filter((candidate) =>
    isCenterPoint(candidate, centerFeature)
  );

  if (matchedByIdentity.length === 1) {
    return matchedByIdentity[0];
  }

  if (matchedByIdentity.length > 1) {
    return matchedByIdentity.reduce((closest, candidate) => {
      const closestDistance = getHaversineDistanceKm(
        center,
        closest.geometry.coordinates
      );
      const candidateDistance = getHaversineDistanceKm(
        center,
        candidate.geometry.coordinates
      );
      return candidateDistance < closestDistance ? candidate : closest;
    });
  }

  let closest = null;
  let closestDistanceKm = CENTER_MATCH_THRESHOLD_KM;

  for (const candidate of candidates) {
    const coordinates = candidate.geometry?.coordinates;
    if (!coordinates) {
      continue;
    }

    const distanceKm = getHaversineDistanceKm(center, coordinates);
    if (distanceKm <= closestDistanceKm) {
      closestDistanceKm = distanceKm;
      closest = candidate;
    }
  }

  return closest;
}

/**
 * Возвращает точки из отфильтрованного набора, попавшие внутрь ареала
 * вокруг centerFeature (без самой центральной точки).
 */
export function getPointsWithinAreal(centerFeature, radiusKm, filters = {}) {
  const resolvedCenter = resolveCenterFeature(centerFeature, filters);
  const center =
    resolvedCenter?.geometry?.coordinates ?? centerFeature?.geometry?.coordinates;

  if (!center || radiusKm <= 0) {
    return [];
  }

  return getToolFeatures(filters).filter((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) {
      return false;
    }

    if (resolvedCenter && feature === resolvedCenter) {
      return false;
    }

    if (
      isCenterPoint(feature, centerFeature) ||
      (resolvedCenter && isCenterPoint(feature, resolvedCenter))
    ) {
      return false;
    }

    return getHaversineDistanceKm(center, coordinates) <= radiusKm;
  });
}

/** Сводка по точкам внутри ареала: количество и список точек. */
export function getArealContainedPointsSummary(centerFeature, radiusKm, filters = {}) {
  const points = getPointsWithinAreal(centerFeature, radiusKm, filters).sort((a, b) => {
    const nameA = a.properties?.name_ru ?? "";
    const nameB = b.properties?.name_ru ?? "";
    return nameA.localeCompare(nameB, "ru");
  });

  return {
    count: points.length,
    points
  };
}

/** Ключ точки для сравнения записей ареала (координаты + вид + год находки). */
export function getArealPointKey(feature) {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const { name_latin: nameLatin = "", found_year: foundYear = "" } = feature.properties ?? {};
  return `${lng},${lat}-${nameLatin}-${foundYear}`;
}

function arealEntryFromFeature(feature) {
  return {
    center: feature.geometry.coordinates,
    color: getPointColorForRegnum(feature.properties?.regnum)
  };
}

/** Принимает feature, координату [lng, lat] или массив таких значений. */
function normalizeArealItems(items) {
  if (!items) {
    return [];
  }

  if (items.type === "Feature" && items.geometry?.coordinates) {
    return [arealEntryFromFeature(items)];
  }

  if (isCoordinatePair(items)) {
    return [{ center: items, color: getPointColorForRegnum() }];
  }

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  if (isCoordinatePair(items[0])) {
    return items.map((center) => ({
      center,
      color: getPointColorForRegnum()
    }));
  }

  return items.map((item) =>
    item.type === "Feature" && item.geometry?.coordinates
      ? arealEntryFromFeature(item)
      : { center: item.center ?? item, color: item.color ?? getPointColorForRegnum(item.regnum) }
  );
}

/**
 * Строит GeoJSON-полигон — геодезический круг (Turf).
 * radiusKm — радиус в километрах от центра.
 */
function createCirclePolygon(center, radiusKm, color, steps = 64) {
  const circleFeature = circle(center, radiusKm, { units: "kilometers", steps });

  return {
    ...circleFeature,
    properties: {
      ...circleFeature.properties,
      color
    }
  };
}

/** Добавляет на карту слой заливки и контура ареала (изначально пустой). */
export function addArealLayer(map) {
  if (map.getSource("areal")) {
    return;
  }

  map.addSource("areal", {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: "areal-fill",
    type: "fill",
    source: "areal",
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.2
    }
  });

  map.addLayer({
    id: "areal-outline",
    type: "line",
    source: "areal",
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1
    }
  });
}

/** Рисует круги заданного радиуса вокруг одной или нескольких точек. */
export function updateArealLayer(map, items, radiusKm) {
  const source = map.getSource("areal");
  if (!source) {
    return;
  }

  const features = normalizeArealItems(items).map(({ center, color }) =>
    createCirclePolygon(center, radiusKm, color)
  );

  source.setData({
    type: "FeatureCollection",
    features
  });
}

/** Строит ареалы вокруг всех некластеризованных точек, видимых на карте. */
export function updateArealLayerForAll(map, radiusKm, filters = {}, expandedLeaves = null) {
  const features = getUnclusteredFeatures(map, filters, expandedLeaves);
  updateArealLayer(map, features, radiusKm);
}

/**
 * Пересчитывает отображение ареала по текущему режиму:
 * ко всем маркерам, вокруг выбранной точки или очистка слоя.
 */
export function refreshArealDisplay(
  map,
  { allMarkers, enabled, feature, radiusKm, filters = {}, expandedLeaves = null }
) {
  if (!map) {
    return;
  }

  if (allMarkers) {
    updateArealLayerForAll(map, radiusKm, filters, expandedLeaves);
    return;
  }

  if (
    enabled &&
    feature &&
    featureMatchesFilters(feature, filters) &&
    // Ареал для одной точки показываем только если она не внутри кластера.
    isFeatureUnclusteredOnMap(map, feature)
  ) {
    updateArealLayer(map, feature, radiusKm);
    return;
  }

  clearArealLayer(map);
}

export function clearArealLayer(map) {
  const source = map.getSource("areal");
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clearArealPointHintTimer() {
  if (arealPointHintHideTimer) {
    clearTimeout(arealPointHintHideTimer);
    arealPointHintHideTimer = null;
  }
}

/** Показывает подсказку с русским названием над точкой. */
export function showArealPointHint(map, feature) {
  const coordinates = feature?.geometry?.coordinates;
  const nameRu = feature?.properties?.name_ru || "Без названия";

  if (!map || !coordinates) {
    return;
  }

  arealPointHintGeneration += 1;
  clearArealPointHintTimer();

  if (arealPointHintPopup) {
    arealPointHintPopup.remove();
    arealPointHintPopup = null;
  }

  const generation = arealPointHintGeneration;

  arealPointHintPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "areal-point-hint",
    anchor: "bottom",
    offset: 10
  });

  arealPointHintPopup
    .setLngLat(coordinates)
    .setHTML(`<div class="areal-point-hint-name">${escapeHtml(nameRu)}</div>`)
    .addTo(map);

  arealPointHintTarget = feature;

  arealPointHintHideTimer = setTimeout(() => {
    if (generation !== arealPointHintGeneration) {
      return;
    }

    hideArealPointHint();
  }, AREAL_HINT_VISIBLE_MS);
}

/** Скрывает подсказку с названием точки над ареалом. */
export function hideArealPointHint() {
  arealPointHintGeneration += 1;
  clearArealPointHintTimer();
  arealPointHintTarget = null;

  if (!arealPointHintPopup) {
    return;
  }

  arealPointHintPopup.remove();
  arealPointHintPopup = null;
}

/** Скрывает подсказку, если пользователь кликнул по точке с активной подсказкой. */
export function dismissArealPointHintOnPointClick(feature) {
  if (!arealPointHintTarget || !feature) {
    return;
  }

  if (isCenterPoint(feature, arealPointHintTarget)) {
    hideArealPointHint();
  }
}

/** Сдвигает карту к точке и показывает подсказку после завершения анимации. */
export function panToArealPoint(map, feature) {
  const coordinates = feature?.geometry?.coordinates;

  if (!map || !coordinates) {
    return;
  }

  let hintShown = false;

  const showHintOnce = () => {
    if (hintShown) {
      return;
    }

    hintShown = true;
    showArealPointHint(map, feature);
  };

  map.once("moveend", showHintOnce);
  map.panTo(coordinates, { duration: 500 });

  // moveend иногда не срабатывает, если карта уже на месте.
  setTimeout(showHintOnce, 600);
}
