import { buffer, convex, featureCollection, lineString, point } from "@turf/turf";
import { getFilteredFeatures, getPointColorForRegnum } from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const SOURCE_ID = "species-polygon";

/** Ключ вида — латинское название. */
export function getSpeciesKey(feature) {
  return feature?.properties?.name_latin ?? "";
}

/** Все точки набора данных, относящиеся к тому же виду. */
export function getPointsForSpecies(feature) {
  const speciesKey = getSpeciesKey(feature);
  if (!speciesKey) {
    return [];
  }

  return getFilteredFeatures().filter(
    (candidate) => candidate.properties?.name_latin === speciesKey
  );
}

/**
 * Строит GeoJSON-полигон по набору координат.
 * Turf convex требует минимум три точки; для одной и двух — буфер вокруг точки/отрезка.
 */
function buildPolygonFromCoordinates(coordinates) {
  if (coordinates.length === 0) {
    return null;
  }

  if (coordinates.length === 1) {
    return buffer(point(coordinates[0]), 0.5, { units: "kilometers" });
  }

  if (coordinates.length === 2) {
    return buffer(lineString(coordinates), 0.3, { units: "kilometers" });
  }

  return convex(featureCollection(coordinates.map((coords) => point(coords))));
}

/** Добавляет на карту слой полигона вида (изначально пустой). */
export function addSpeciesPolygonLayer(map) {
  if (map.getSource(SOURCE_ID)) {
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: "species-polygon-fill",
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.25
    }
  });

  map.addLayer({
    id: "species-polygon-outline",
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 2
    }
  });
}

/**
 * Строит полигон (выпуклая оболочка Turf.js) по всем точкам выбранного вида
 * и отображает его на карте.
 * Возвращает сводку для панели модуля: built, pointCount, nameRu, nameLatin.
 */
export function updateSpeciesPolygonLayer(map, feature) {
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return { built: false, pointCount: 0 };
  }

  const speciesPoints = getPointsForSpecies(feature);
  const coordinates = speciesPoints
    .map((speciesFeature) => speciesFeature.geometry?.coordinates)
    .filter(Boolean);

  const polygon = buildPolygonFromCoordinates(coordinates);

  if (!polygon) {
    source.setData(EMPTY_COLLECTION);
    return {
      built: false,
      pointCount: coordinates.length,
      nameRu: feature.properties?.name_ru,
      nameLatin: feature.properties?.name_latin
    };
  }

  const color = getPointColorForRegnum(feature.properties?.regnum);

  polygon.properties = {
    ...polygon.properties,
    color,
    name_latin: feature.properties?.name_latin,
    name_ru: feature.properties?.name_ru,
    pointCount: coordinates.length
  };

  source.setData({
    type: "FeatureCollection",
    features: [polygon]
  });

  return {
    built: true,
    pointCount: coordinates.length,
    nameRu: feature.properties?.name_ru,
    nameLatin: feature.properties?.name_latin
  };
}

/** Очищает слой полигона вида на карте. */
export function clearSpeciesPolygonLayer(map) {
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}
