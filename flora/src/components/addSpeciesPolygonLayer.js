import {
  area,
  booleanIntersects,
  booleanPointInPolygon,
  buffer,
  cleanCoords,
  concave,
  convex,
  distance,
  featureCollection,
  intersect,
  kinks,
  lineString,
  multiPolygon,
  nearestPointOnLine,
  point,
  polygon,
  polygonToLine,
  rewind,
  truncate
} from "@turf/turf";
import { normalizeLatinName } from "../dataWork/normalizeLatinName";
import { getToolFeatures, getPointColorForRegnum } from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const SOURCE_ID = "species-polygon";
const INTERSECTION_SOURCE_ID = "species-polygon-intersection";

const POLYGON_FILL_OPACITY = 0.14;
const POLYGON_OUTLINE_WIDTH = 1.25;
const POLYGON_OUTLINE_OPACITY = 0.7;
const POLYGON_OUTLINE_DASHARRAY = [6, 5];
const POLYGON_GLOW_WIDTH = 4;
const POLYGON_GLOW_BLUR = 1.4;
const POLYGON_GLOW_OPACITY = 0.12;

const INTERSECTION_FILL_COLOR = "#ddd6fe";
const INTERSECTION_FILL_OPACITY = 0.22;
const INTERSECTION_OUTLINE_COLOR = "#8b5cf6";
const INTERSECTION_OUTLINE_WIDTH = 1.25;
const INTERSECTION_OUTLINE_OPACITY = 0.72;
const INTERSECTION_OUTLINE_DASHARRAY = [5, 4];
const INTERSECTION_GLOW_WIDTH = 4;
const INTERSECTION_GLOW_BLUR = 0.5;
const INTERSECTION_GLOW_OPACITY = 0.1;

const CLIP_COORDINATE_PRECISION = 7;
const BOUNDARY_SNAP_TOLERANCE_KM = 0.01;

export const POLYGON_BUILD_MODES = {
  CONVEX: "convex",
  EXTREME_POINTS: "extreme_points",
  ALL_POINTS: "all_points"
};

/** Режим «все точки» даёт самопересечения при большой выборке — ограничиваем число вершин. */
export const ALL_POINTS_MAX_UNIQUE = 200;

export function canBuildAllPointsPolygon(uniqueCount) {
  return uniqueCount >= 3 && uniqueCount <= ALL_POINTS_MAX_UNIQUE;
}

/** Ключ вида — латинское название. */
export function getSpeciesKey(feature) {
  return feature?.properties?.name_latin ?? "";
}

/** Все точки набора данных (локальные + GBIF), относящиеся к тому же виду. */
export function getPointsForSpecies(feature) {
  const nameLatin = getSpeciesKey(feature);
  if (!nameLatin) {
    return [];
  }

  const nameLatinNorm = normalizeLatinName(nameLatin);
  if (!nameLatinNorm) {
    return [];
  }

  return getToolFeatures({}).filter(
    (candidate) =>
      normalizeLatinName(candidate.properties?.name_latin) === nameLatinNorm
  );
}

export function getUniqueCoordinateCountForSpecies(feature) {
  const coordinates = getPointsForSpecies(feature)
    .map((speciesFeature) => speciesFeature.geometry?.coordinates)
    .filter(Boolean);
  return dedupeCoordinates(coordinates).length;
}

/** Убирает повторяющиеся координаты (с точностью до 6 знаков после запятой). */
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

/**
 * Строит GeoJSON-полигон по набору координат.
 * Turf convex требует минимум три точки; для одной и двух — буфер вокруг точки/отрезка.
 */
function buildConvexPolygon(coordinates) {
  const uniqueCoordinates = dedupeCoordinates(coordinates);

  if (uniqueCoordinates.length === 0) {
    return null;
  }

  if (uniqueCoordinates.length === 1) {
    return buffer(point(uniqueCoordinates[0]), 0.5, { units: "kilometers" });
  }

  if (uniqueCoordinates.length === 2) {
    return buffer(lineString(uniqueCoordinates), 0.3, { units: "kilometers" });
  }

  return convex(featureCollection(uniqueCoordinates.map((coords) => point(coords))));
}

function sampleEvenly(items, limit) {
  if (items.length <= limit) {
    return items;
  }

  const sampled = [];
  const step = (items.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    sampled.push(items[Math.round(index * step)]);
  }
  return sampled;
}

function percentile(sorted, ratio) {
  if (!sorted.length) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(ratio * (sorted.length - 1))));
  return sorted[index];
}

/** Оценка maxEdge для вогнутой оболочки: чуть больше типичного расстояния до соседа. */
function estimateConcaveMaxEdgeKm(coordinates) {
  const sample = sampleEvenly(coordinates, 600);
  const nearest = [];

  for (let i = 0; i < sample.length; i += 1) {
    let minDistance = Infinity;
    const origin = point(sample[i]);
    for (let j = 0; j < sample.length; j += 1) {
      if (i === j) {
        continue;
      }
      const meters = distance(origin, point(sample[j]), { units: "kilometers" });
      if (meters > 0 && meters < minDistance) {
        minDistance = meters;
      }
    }
    if (minDistance < Infinity) {
      nearest.push(minDistance);
    }
  }

  nearest.sort((left, right) => left - right);
  const typical = percentile(nearest, 0.85) || 1;
  return Math.max(typical * 3.2, 0.05);
}

function bboxDiagonalKm(coordinates) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  coordinates.forEach(([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  });

  if (!Number.isFinite(minLon) || (minLon === maxLon && minLat === maxLat)) {
    return 1;
  }

  return Math.max(
    distance(point([minLon, minLat]), point([maxLon, maxLat]), { units: "kilometers" }),
    0.05
  );
}

/** Один внешний контур без дыр, без самопересечений и без разрыва на несколько полигонов. */
function toSingleOuterPolygon(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type !== "Polygon") {
    return null;
  }

  const outerRing = geometry.coordinates?.[0];
  if (!Array.isArray(outerRing) || outerRing.length < 4) {
    return null;
  }

  try {
    const simple = rewind(cleanCoords(polygon([outerRing])));
    if (simple?.geometry?.type !== "Polygon") {
      return null;
    }

    if ((simple.geometry.coordinates?.length ?? 0) !== 1) {
      return null;
    }

    const crossings = kinks(simple);
    if (Array.isArray(crossings?.features) && crossings.features.length > 0) {
      return null;
    }

    return simple;
  } catch {
    return null;
  }
}

/**
 * Граница выборки: одна неразрывная вогнутая оболочка по всем крайним точкам.
 * Внутренние точки в контур не входят. Несколько кусков не допускается.
 */
function buildBoundaryPolygon(coordinates) {
  const uniqueCoordinates = dedupeCoordinates(coordinates);

  if (uniqueCoordinates.length <= 3) {
    return buildConvexPolygon(uniqueCoordinates);
  }

  const points = featureCollection(uniqueCoordinates.map((coords) => point(coords)));
  const convexHull = buildConvexPolygon(uniqueCoordinates);
  const diagonalKm = bboxDiagonalKm(uniqueCoordinates);
  let maxEdge = estimateConcaveMaxEdgeKm(uniqueCoordinates);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const hull = concave(points, { maxEdge, units: "kilometers" });
      const single = toSingleOuterPolygon(hull);
      if (single) {
        return single;
      }
    } catch {
      // Слишком короткое ребро — оболочка с дырами или самопересечениями; удлиняем maxEdge.
    }

    if (maxEdge >= diagonalKm) {
      break;
    }
    maxEdge = Math.min(maxEdge * 1.65, diagonalKm);
  }

  return convexHull;
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

/** Строит полигон: все точки / граница выборки / выпуклая оболочка. */
export function buildPolygonFromCoordinates(coordinates, mode = POLYGON_BUILD_MODES.CONVEX) {
  if (mode === POLYGON_BUILD_MODES.ALL_POINTS) {
    return buildAllPointsPolygon(coordinates);
  }

  if (mode === POLYGON_BUILD_MODES.EXTREME_POINTS) {
    return buildBoundaryPolygon(coordinates);
  }

  return buildConvexPolygon(coordinates);
}

const SPECIES_POLYGON_FILL_PAINT = {
  "fill-color": ["get", "outlineColor"],
  "fill-opacity": POLYGON_FILL_OPACITY,
  "fill-antialias": true
};

const SPECIES_POLYGON_GLOW_PAINT = {
  "line-color": ["get", "outlineColor"],
  "line-width": POLYGON_GLOW_WIDTH,
  "line-opacity": POLYGON_GLOW_OPACITY,
  "line-blur": POLYGON_GLOW_BLUR
};

const SPECIES_POLYGON_OUTLINE_PAINT = {
  "line-color": ["get", "outlineColor"],
  "line-width": POLYGON_OUTLINE_WIDTH,
  "line-opacity": POLYGON_OUTLINE_OPACITY,
  "line-dasharray": POLYGON_OUTLINE_DASHARRAY,
  "line-join": "round",
  "line-cap": "round"
};

const INTERSECTION_FILL_PAINT = {
  "fill-color": INTERSECTION_FILL_COLOR,
  "fill-opacity": INTERSECTION_FILL_OPACITY,
  "fill-antialias": true
};

const INTERSECTION_GLOW_PAINT = {
  "line-color": INTERSECTION_OUTLINE_COLOR,
  "line-width": INTERSECTION_GLOW_WIDTH,
  "line-opacity": INTERSECTION_GLOW_OPACITY,
  "line-blur": INTERSECTION_GLOW_BLUR
};

const INTERSECTION_OUTLINE_PAINT = {
  "line-color": INTERSECTION_OUTLINE_COLOR,
  "line-width": INTERSECTION_OUTLINE_WIDTH,
  "line-opacity": INTERSECTION_OUTLINE_OPACITY,
  "line-dasharray": INTERSECTION_OUTLINE_DASHARRAY,
  "line-join": "round",
  "line-cap": "round"
};

function applyPaintProperties(map, layerId, paint) {
  if (!map.getLayer(layerId)) {
    return;
  }

  Object.entries(paint).forEach(([property, value]) => {
    map.setPaintProperty(layerId, property, value);
  });
}

function ensureSpeciesPolygonGlowLayer(map) {
  if (map.getLayer("species-polygon-outline-glow") || !map.getSource(SOURCE_ID)) {
    return;
  }

  // Вставляем свечение перед контуром, чтобы контур оставался поверх него.
  const beforeLayerId = map.getLayer("species-polygon-outline")
    ? "species-polygon-outline"
    : undefined;

  map.addLayer(
    {
      id: "species-polygon-outline-glow",
      type: "line",
      source: SOURCE_ID,
      paint: SPECIES_POLYGON_GLOW_PAINT
    },
    beforeLayerId
  );
}

function applySpeciesPolygonLayerStyles(map) {
  if (!map.getLayer("species-polygon-fill")) {
    return;
  }

  if (map.getPaintProperty("species-polygon-fill", "fill-pattern")) {
    map.removePaintProperty("species-polygon-fill", "fill-pattern");
  }

  applyPaintProperties(map, "species-polygon-fill", SPECIES_POLYGON_FILL_PAINT);
  ensureSpeciesPolygonGlowLayer(map);
  applyPaintProperties(map, "species-polygon-outline-glow", SPECIES_POLYGON_GLOW_PAINT);
  applyPaintProperties(map, "species-polygon-outline", SPECIES_POLYGON_OUTLINE_PAINT);
}

function ensureSpeciesPolygonIntersectionGlowLayer(map) {
  if (map.getLayer("species-polygon-intersection-glow") || !map.getSource(INTERSECTION_SOURCE_ID)) {
    return;
  }

  // Вставляем свечение перед контуром, чтобы контур оставался поверх него.
  const beforeLayerId = map.getLayer("species-polygon-intersection-outline")
    ? "species-polygon-intersection-outline"
    : undefined;

  map.addLayer(
    {
      id: "species-polygon-intersection-glow",
      type: "line",
      source: INTERSECTION_SOURCE_ID,
      paint: INTERSECTION_GLOW_PAINT
    },
    beforeLayerId
  );
}

function applySpeciesPolygonIntersectionLayerStyles(map) {
  if (!map.getLayer("species-polygon-intersection-fill")) {
    return;
  }

  applyPaintProperties(map, "species-polygon-intersection-fill", INTERSECTION_FILL_PAINT);
  ensureSpeciesPolygonIntersectionGlowLayer(map);
  applyPaintProperties(map, "species-polygon-intersection-glow", INTERSECTION_GLOW_PAINT);
  applyPaintProperties(map, "species-polygon-intersection-outline", INTERSECTION_OUTLINE_PAINT);
}

function ensureSpeciesPolygonIntersectionLayers(map) {
  if (!map.getSource(INTERSECTION_SOURCE_ID)) {
    map.addSource(INTERSECTION_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION
    });

    map.addLayer({
      id: "species-polygon-intersection-fill",
      type: "fill",
      source: INTERSECTION_SOURCE_ID,
      paint: INTERSECTION_FILL_PAINT
    });

    map.addLayer({
      id: "species-polygon-intersection-glow",
      type: "line",
      source: INTERSECTION_SOURCE_ID,
      paint: INTERSECTION_GLOW_PAINT
    });

    map.addLayer({
      id: "species-polygon-intersection-outline",
      type: "line",
      source: INTERSECTION_SOURCE_ID,
      paint: INTERSECTION_OUTLINE_PAINT
    });

    return;
  }

  applySpeciesPolygonIntersectionLayerStyles(map);
}

/** Добавляет на карту слой полигона вида (изначально пустой). */
export function addSpeciesPolygonLayer(map) {
  if (map.getSource(SOURCE_ID)) {
    applySpeciesPolygonLayerStyles(map);
    ensureSpeciesPolygonIntersectionLayers(map);
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
    paint: SPECIES_POLYGON_FILL_PAINT
  });

  map.addLayer({
    id: "species-polygon-outline-glow",
    type: "line",
    source: SOURCE_ID,
    paint: SPECIES_POLYGON_GLOW_PAINT
  });

  map.addLayer({
    id: "species-polygon-outline",
    type: "line",
    source: SOURCE_ID,
    paint: SPECIES_POLYGON_OUTLINE_PAINT
  });

  ensureSpeciesPolygonIntersectionLayers(map);
}

/** Первая точка вида — для перестроения полигона по name_latin. */
export function getRepresentativeFeatureForSpecies(nameLatin) {
  if (!nameLatin) {
    return null;
  }

  return getToolFeatures().find(
    (candidate) => candidate.properties?.name_latin === nameLatin
  ) ?? null;
}

/** Переключает режим построения полигона: выпуклая оболочка ↔ все точки. */
export function toggleSpeciesPolygonBuildMode(polygons, polygonId) {
  const existing = polygons.find((entry) => entry.id === polygonId);
  if (!existing) {
    return polygons;
  }

  const feature = getRepresentativeFeatureForSpecies(existing.nameLatin);
  if (!feature) {
    return polygons;
  }

  const nextMode =
    existing.mode === POLYGON_BUILD_MODES.ALL_POINTS
      ? POLYGON_BUILD_MODES.CONVEX
      : POLYGON_BUILD_MODES.ALL_POINTS;

  const uniqueCount = existing.uniquePointCount ?? existing.pointCount;
  if (nextMode === POLYGON_BUILD_MODES.ALL_POINTS && !canBuildAllPointsPolygon(uniqueCount)) {
    return polygons;
  }

  return upsertSpeciesPolygon(polygons, feature, nextMode);
}

/**
 * Строит запись полигона вида без обновления карты.
 * id совпадает с name_latin — один полигон на вид.
 */
export function buildSpeciesPolygonEntry(
  feature,
  { mode = POLYGON_BUILD_MODES.CONVEX, hidden = false } = {}
) {
  const nameLatin = feature.properties?.name_latin ?? "";
  const nameRu = feature.properties?.name_ru ?? "";
  const speciesPoints = getPointsForSpecies(feature);
  const coordinates = speciesPoints
    .map((speciesFeature) => speciesFeature.geometry?.coordinates)
    .filter(Boolean);
  const uniqueCoordinates = dedupeCoordinates(coordinates);

  const polygonFeature = buildPolygonFromCoordinates(coordinates, mode);

  if (!polygonFeature || !nameLatin) {
    return null;
  }

  const outlineColor = getPointColorForRegnum(feature.properties?.regnum);

  polygonFeature.properties = {
    ...polygonFeature.properties,
    outlineColor,
    name_latin: nameLatin,
    name_ru: nameRu,
    pointCount: coordinates.length,
    uniquePointCount: uniqueCoordinates.length,
    polygonId: nameLatin
  };

  return {
    id: nameLatin,
    built: true,
    pointCount: coordinates.length,
    uniquePointCount: uniqueCoordinates.length,
    nameRu,
    nameLatin,
    polygon: polygonFeature,
    mode,
    outlineColor,
    hidden
  };
}

/** Добавляет или обновляет полигон вида в массиве (ключ — name_latin). */
export function upsertSpeciesPolygon(polygons, feature, mode) {
  const nameLatin = feature.properties?.name_latin ?? "";
  const existingIndex = polygons.findIndex((entry) => entry.nameLatin === nameLatin);
  const existing = existingIndex >= 0 ? polygons[existingIndex] : null;
  const entry = buildSpeciesPolygonEntry(feature, {
    mode,
    hidden: existing?.hidden ?? false
  });

  if (!entry) {
    if (existingIndex >= 0) {
      return polygons.filter((_, index) => index !== existingIndex);
    }

    return polygons;
  }

  if (existingIndex >= 0) {
    const next = [...polygons];
    next[existingIndex] = entry;
    return next;
  }

  return [...polygons, entry];
}

/** Синхронизирует GeoJSON-источник с массивом полигонов (скрытые не отображаются). */
export function syncSpeciesPolygonLayer(map, polygons) {
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return;
  }

  const features = polygons
    .filter((entry) => entry.built && entry.polygon && !entry.hidden)
    .map((entry) => entry.polygon);

  source.setData({
    type: "FeatureCollection",
    features
  });
}

/**
 * Точки из отфильтрованного набора внутри полигона вида,
 * без точек вида, по которому полигон построен.
 */
export function getPointsWithinSpeciesPolygon(polygonFeature, excludeSpeciesLatin, filters = {}) {
  if (!polygonFeature?.geometry) {
    return [];
  }

  return getToolFeatures(filters).filter((feature) => {
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
  clearSpeciesPolygonIntersectionLayer(map);
}

function normalizePolygonFeatureForClip(feature) {
  if (!feature?.geometry) {
    return feature;
  }

  return truncate(cleanCoords(rewind(feature)), {
    precision: CLIP_COORDINATE_PRECISION,
    coordinates: 2
  });
}

function getPolygonBoundaryLineFeatures(...features) {
  return features.flatMap((feature) => {
    if (!feature?.geometry) {
      return [];
    }

    const line = polygonToLine(feature);

    if (line.type === "FeatureCollection") {
      return line.features;
    }

    return [line];
  });
}

function snapCoordinateToParentBoundaries(coordinate, boundaryLines) {
  const originalPoint = point(coordinate);
  let snappedCoordinate = coordinate;
  let nearestDistance = BOUNDARY_SNAP_TOLERANCE_KM;

  boundaryLines.forEach((lineFeature) => {
    const nearest = nearestPointOnLine(lineFeature, originalPoint);
    const separation = distance(originalPoint, nearest, { units: "kilometers" });

    if (separation < nearestDistance) {
      nearestDistance = separation;
      snappedCoordinate = nearest.geometry.coordinates;
    }
  });

  return snappedCoordinate;
}

function snapRingToParentBoundaries(ring, boundaryLines) {
  if (!ring.length) {
    return ring;
  }

  const isClosed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const openRing = isClosed ? ring.slice(0, -1) : [...ring];
  const snappedOpenRing = openRing.map((coordinate) =>
    snapCoordinateToParentBoundaries(coordinate, boundaryLines)
  );

  if (snappedOpenRing.length === 0) {
    return ring;
  }

  return [...snappedOpenRing, snappedOpenRing[0]];
}

function snapIntersectionFeatureToParentBoundaries(intersectionFeature, parentA, parentB) {
  if (!intersectionFeature?.geometry) {
    return intersectionFeature;
  }

  const boundaryLines = getPolygonBoundaryLineFeatures(parentA, parentB);
  const { geometry, properties } = intersectionFeature;

  if (geometry.type === "Polygon") {
    return polygon(
      geometry.coordinates.map((ring) => snapRingToParentBoundaries(ring, boundaryLines)),
      properties
    );
  }

  if (geometry.type === "MultiPolygon") {
    return multiPolygon(
      geometry.coordinates.map((polygonCoordinates) =>
        polygonCoordinates.map((ring) => snapRingToParentBoundaries(ring, boundaryLines))
      ),
      properties
    );
  }

  return intersectionFeature;
}

/**
 * Вычисляет пересечение двух GeoJSON-полигонов.
 * Возвращает feature, флаг наличия пересечения и площадь в км².
 */
export function computeSpeciesPolygonIntersection(polygonFeatureA, polygonFeatureB) {
  if (!polygonFeatureA?.geometry || !polygonFeatureB?.geometry) {
    return { feature: null, hasIntersection: false, areaKm2: 0 };
  }

  const normalizedA = normalizePolygonFeatureForClip(polygonFeatureA);
  const normalizedB = normalizePolygonFeatureForClip(polygonFeatureB);

  if (!booleanIntersects(normalizedA, normalizedB)) {
    return { feature: null, hasIntersection: false, areaKm2: 0 };
  }

  const feature = intersect(featureCollection([normalizedA, normalizedB]));

  if (!feature?.geometry) {
    return { feature: null, hasIntersection: false, areaKm2: 0 };
  }

  const alignedFeature = snapIntersectionFeatureToParentBoundaries(
    feature,
    normalizedA,
    normalizedB
  );
  const resultFeature = truncate(alignedFeature, {
    precision: CLIP_COORDINATE_PRECISION,
    coordinates: 2
  });

  return {
    feature: resultFeature,
    hasIntersection: true,
    areaKm2: area(resultFeature) / 1_000_000
  };
}

/** Точки из отфильтрованного набора внутри произвольного полигона. */
export function getPointsWithinPolygonFeature(polygonFeature, filters = {}) {
  if (!polygonFeature?.geometry) {
    return [];
  }

  return getToolFeatures(filters).filter((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) {
      return false;
    }

    return booleanPointInPolygon(point(coordinates), polygonFeature);
  });
}

/** Сводка по точкам внутри полигона пересечения. */
export function getPolygonIntersectionContainedSummary(
  polygonFeature,
  filters = {},
  excludeSpeciesLatins = []
) {
  const excludedSpecies = new Set(excludeSpeciesLatins.filter(Boolean));

  const points = getPointsWithinPolygonFeature(polygonFeature, filters)
    .filter((feature) => {
      const nameLatin = feature.properties?.name_latin;
      return !nameLatin || !excludedSpecies.has(nameLatin);
    })
    .sort((a, b) => {
      const nameA = a.properties?.name_ru ?? "";
      const nameB = b.properties?.name_ru ?? "";
      return nameA.localeCompare(nameB, "ru");
    });

  return {
    count: points.length,
    points
  };
}

/** Рисует зону пересечения на карте. */
export function updateSpeciesPolygonIntersectionLayer(map, intersectionFeature) {
  const source = map.getSource(INTERSECTION_SOURCE_ID);
  if (!source) {
    return;
  }

  if (!intersectionFeature?.geometry) {
    source.setData(EMPTY_COLLECTION);
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: [intersectionFeature]
  });
}

/** Убирает зону пересечения с карты. */
export function clearSpeciesPolygonIntersectionLayer(map) {
  const source = map.getSource(INTERSECTION_SOURCE_ID);
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}
