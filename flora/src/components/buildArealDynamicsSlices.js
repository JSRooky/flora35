import { area, difference, featureCollection } from "@turf/turf";
import { getFeatureCollection } from "../locations/loadPoints";
import {
  buildPolygonFromCoordinates,
  POLYGON_BUILD_MODES
} from "./addSpeciesPolygonLayer";
import { getYearBounds } from "./yearBounds";
import { getTimelineColorHex, getYearColorRatio } from "./timelineColors";

const SLICE_CACHE = new Map();

function getSliceCacheKey(nameLatin, mode) {
  return `${nameLatin}::${mode}`;
}

function getSpeciesPoints(nameLatin) {
  if (!nameLatin) {
    return [];
  }

  return getFeatureCollection().features.filter(
    (candidate) => candidate.properties?.name_latin === nameLatin
  );
}

function getSliceGeometry(currentHull, previousHull) {
  if (!currentHull) {
    return null;
  }

  if (!previousHull) {
    return currentHull;
  }

  try {
    const delta = difference(featureCollection([currentHull, previousHull]));
    if (delta?.geometry) {
      return delta;
    }
  } catch {
    // Turf difference может не сработать на вырожденной геометрии — показываем полный hull.
  }

  return currentHull;
}

function hasGeometry(feature) {
  const type = feature?.geometry?.type;
  return type === "Polygon" || type === "MultiPolygon";
}

/**
 * Строит послойные срезы расширения ареала вида по годам.
 * Каждый срез — прирост полигона относительно предыдущего года с находками.
 */
export function buildArealDynamicsSlices(
  feature,
  mode = POLYGON_BUILD_MODES.CONVEX
) {
  const nameLatin = feature?.properties?.name_latin ?? "";

  if (!nameLatin) {
    return [];
  }

  const cacheKey = getSliceCacheKey(nameLatin, mode);
  const cached = SLICE_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const speciesPoints = getSpeciesPoints(nameLatin);
  const pointsByYear = new Map();

  speciesPoints.forEach((speciesFeature) => {
    const foundYear = speciesFeature.properties?.found_year;
    const coordinates = speciesFeature.geometry?.coordinates;

    if (!Number.isFinite(foundYear) || !coordinates) {
      return;
    }

    if (!pointsByYear.has(foundYear)) {
      pointsByYear.set(foundYear, []);
    }

    pointsByYear.get(foundYear).push(coordinates);
  });

  const years = [...pointsByYear.keys()].sort((a, b) => a - b);

  if (years.length === 0) {
    return [];
  }

  const cumulativeCoordinates = [];
  let previousHull = null;
  const slices = [];

  years.forEach((year) => {
    cumulativeCoordinates.push(...pointsByYear.get(year));

    const currentHull = buildPolygonFromCoordinates(cumulativeCoordinates, mode);

    if (!currentHull) {
      return;
    }

    const sliceGeometry = getSliceGeometry(currentHull, previousHull);

    if (!sliceGeometry || !hasGeometry(sliceGeometry)) {
      previousHull = currentHull;
      return;
    }

    const colorRatio = getYearColorRatio(year, getYearBounds().min, getYearBounds().max);
    const newPointCount = pointsByYear.get(year).length;
    const fillColor = getTimelineColorHex(colorRatio);

    sliceGeometry.properties = {
      year,
      fillColor,
      name_latin: nameLatin,
      newPointCount,
      areaKm2: area(sliceGeometry) / 1_000_000
    };

    slices.push({
      year,
      geometry: sliceGeometry,
      color: fillColor,
      newPointCount,
      areaKm2: sliceGeometry.properties.areaKm2
    });

    previousHull = currentHull;
  });

  if (slices.length > 0) {
    SLICE_CACHE.set(cacheKey, slices);
  }

  return slices;
}

export function clearArealDynamicsSliceCache(nameLatin) {
  if (nameLatin) {
    [...SLICE_CACHE.keys()].forEach((key) => {
      if (key === nameLatin || key.startsWith(`${nameLatin}::`)) {
        SLICE_CACHE.delete(key);
      }
    });
    return;
  }

  SLICE_CACHE.clear();
}

export function filterSlicesUpToYear(slices, maxYear) {
  return slices.filter((slice) => slice.year <= maxYear);
}
