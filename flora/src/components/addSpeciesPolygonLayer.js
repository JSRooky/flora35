import { booleanPointInPolygon, buffer, convex, featureCollection, lineString, point, polygon } from "@turf/turf";
import { getFilteredFeatures, getPointColorForRegnum } from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const SOURCE_ID = "species-polygon";
const DOT_SPACING = 9;
const DOT_PATTERN_ID = `species-polygon-dots-staggered-${DOT_SPACING}`;
const DOT_PATTERN_WIDTH = DOT_SPACING;
const DOT_PATTERN_HEIGHT = DOT_SPACING * 2;
const DOT_RADIUS = 1.35;
const DOT_PATTERN_OPACITY = 0.72;
const OUTLINE_WIDTH = 2;
const OUTLINE_DASHARRAY = [2, 2];

export const POLYGON_BUILD_MODES = {
  CONVEX: "convex",
  ALL_POINTS: "all_points"
};

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
function dedupeCoordinates(coordinates) {
  const seen = new Set();

  return coordinates.filter(([lon, lat]) => {
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildConvexPolygon(coordinates) {
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

/** Полигон через все точки: вершины упорядочены по углу относительно центра. */
function buildAllPointsPolygon(coordinates) {
  const uniqueCoordinates = dedupeCoordinates(coordinates);

  if (uniqueCoordinates.length === 0) {
    return null;
  }

  if (uniqueCoordinates.length <= 2) {
    return buildConvexPolygon(uniqueCoordinates);
  }

  const centroid = uniqueCoordinates.reduce(
    (accumulator, [lon, lat]) => [accumulator[0] + lon, accumulator[1] + lat],
    [0, 0]
  ).map((value) => value / uniqueCoordinates.length);

  const sortedCoordinates = [...uniqueCoordinates].sort((a, b) => {
    const angleA = Math.atan2(a[1] - centroid[1], a[0] - centroid[0]);
    const angleB = Math.atan2(b[1] - centroid[1], b[0] - centroid[0]);
    return angleA - angleB;
  });

  const ring = [...sortedCoordinates, sortedCoordinates[0]];
  return polygon([ring]);
}

function buildPolygonFromCoordinates(coordinates, mode = POLYGON_BUILD_MODES.CONVEX) {
  if (mode === POLYGON_BUILD_MODES.ALL_POINTS) {
    return buildAllPointsPolygon(coordinates);
  }

  return buildConvexPolygon(coordinates);
}

function drawDotInPattern(data, width, height, centerX, centerY, red, green, blue, alpha) {
  const radiusSquared = DOT_RADIUS * DOT_RADIUS;
  const minX = Math.floor(centerX - DOT_RADIUS - 1);
  const maxX = Math.ceil(centerX + DOT_RADIUS + 1);
  const minY = Math.floor(centerY - DOT_RADIUS - 1);
  const maxY = Math.ceil(centerY + DOT_RADIUS + 1);

  for (let y = minY; y <= maxY; y += 1) {
    if (y < 0 || y >= height) {
      continue;
    }

    for (let x = minX; x <= maxX; x += 1) {
      const deltaX = x + 0.5 - centerX;
      const deltaY = y + 0.5 - centerY;

      if (deltaX * deltaX + deltaY * deltaY > radiusSquared) {
        continue;
      }

      const wrappedX = ((x % width) + width) % width;
      const index = (y * width + wrappedX) * 4;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
      data[index + 3] = alpha;
    }
  }
}

/** Повторяющийся паттерн точек в шахматном порядке (смещение каждого второго ряда). */
function createDotPatternImage(red, green, blue, alpha = 255) {
  const width = DOT_PATTERN_WIDTH;
  const height = DOT_PATTERN_HEIGHT;
  const data = new Uint8Array(width * height * 4);

  drawDotInPattern(data, width, height, width / 2, height / 4, red, green, blue, alpha);
  drawDotInPattern(data, width, height, 0, (height * 3) / 4, red, green, blue, alpha);

  return { width, height, data };
}

function ensureSpeciesPolygonDotPattern(map) {
  if (map.hasImage(DOT_PATTERN_ID)) {
    return;
  }

  map.addImage(DOT_PATTERN_ID, createDotPatternImage(29, 29, 31), { pixelRatio: 2 });
}

/** Добавляет на карту слой полигона вида (изначально пустой). */
export function addSpeciesPolygonLayer(map) {
  if (map.getSource(SOURCE_ID)) {
    if (map.getLayer("species-polygon-outline")) {
      map.setPaintProperty("species-polygon-outline", "line-dasharray", OUTLINE_DASHARRAY);
    }
    return;
  }

  ensureSpeciesPolygonDotPattern(map);

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: "species-polygon-fill",
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-pattern": DOT_PATTERN_ID,
      "fill-opacity": DOT_PATTERN_OPACITY,
      "fill-antialias": true
    }
  });

  map.addLayer({
    id: "species-polygon-outline",
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": ["get", "outlineColor"],
      "line-width": OUTLINE_WIDTH,
      "line-opacity": 0.9,
      "line-dasharray": OUTLINE_DASHARRAY
    }
  });
}

/**
 * Строит полигон (выпуклая оболочка Turf.js) по всем точкам выбранного вида
 * и отображает его на карте.
 * Возвращает сводку для панели модуля: built, pointCount, nameRu, nameLatin, mode.
 */
export function updateSpeciesPolygonLayer(
  map,
  feature,
  { mode = POLYGON_BUILD_MODES.CONVEX } = {}
) {
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return { built: false, pointCount: 0 };
  }

  const speciesPoints = getPointsForSpecies(feature);
  const coordinates = speciesPoints
    .map((speciesFeature) => speciesFeature.geometry?.coordinates)
    .filter(Boolean);

  const polygon = buildPolygonFromCoordinates(coordinates, mode);

  if (!polygon) {
    source.setData(EMPTY_COLLECTION);
    return {
      built: false,
      pointCount: coordinates.length,
      nameRu: feature.properties?.name_ru,
      nameLatin: feature.properties?.name_latin,
      mode
    };
  }

  const color = getPointColorForRegnum(feature.properties?.regnum);

  polygon.properties = {
    ...polygon.properties,
    outlineColor: color,
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
    nameLatin: feature.properties?.name_latin,
    polygon,
    mode
  };
}

/**
 * Точки из отфильтрованного набора внутри полигона вида,
 * без точек вида, по которому полигон построен.
 */
export function getPointsWithinSpeciesPolygon(polygonFeature, excludeSpeciesLatin, filters = {}) {
  if (!polygonFeature?.geometry) {
    return [];
  }

  return getFilteredFeatures(filters).filter((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) {
      return false;
    }

    if (excludeSpeciesLatin && feature.properties?.name_latin === excludeSpeciesLatin) {
      return false;
    }

    return booleanPointInPolygon(point(coordinates), polygonFeature);
  });
}

/** Сводка по видам внутри полигона: количество и список уникальных названий. */
export function getSpeciesPolygonContainedSummary(polygonFeature, excludeSpeciesLatin, filters = {}) {
  const points = getPointsWithinSpeciesPolygon(polygonFeature, excludeSpeciesLatin, filters);
  const speciesByLatin = new Map();

  points.forEach((feature) => {
    const nameLatin = feature.properties?.name_latin;
    const speciesKey = nameLatin || feature.properties?.name_ru;

    if (!speciesKey || speciesByLatin.has(speciesKey)) {
      return;
    }

    speciesByLatin.set(speciesKey, {
      nameRu: feature.properties?.name_ru || "Без названия",
      nameLatin: nameLatin || "",
      point: feature
    });
  });

  const species = [...speciesByLatin.values()].sort((a, b) =>
    a.nameRu.localeCompare(b.nameRu, "ru")
  );

  return {
    count: species.length,
    species
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
