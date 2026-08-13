import { area, difference, featureCollection } from "@turf/turf";
import { getToolFeatures } from "./addLocationsLayer";
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
  return getToolFeatures({}).filter(
    (feature) => feature.properties?.name_latin === nameLatin
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
    // Пустой результат (delta === null) означает, что новых точек за пределами
    // предыдущего hull нет — прироста в этот год не было, слой не рисуем.
    return delta?.geometry ? delta : null;
  } catch {
    // Turf difference не сработал на вырожденной геометрии — показываем полный hull.
    return currentHull;
  }
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

  const yearMin = years[0];
  const yearMax = years[years.length - 1];
  const globalBounds = getYearBounds();
  const colorYearMin = Number.isFinite(globalBounds?.min) ? Math.min(globalBounds.min, yearMin) : yearMin;
  const colorYearMax = Number.isFinite(globalBounds?.max) ? Math.max(globalBounds.max, yearMax) : yearMax;

  const cumulativeCoordinates = [];
  let previousHull = null;
  const slices = [];

  years.forEach((year) => {
    const yearPoints = pointsByYear.get(year) ?? [];
    for (let i = 0; i < yearPoints.length; i += 1) {
      cumulativeCoordinates.push(yearPoints[i]);
    }

    const currentHull = buildPolygonFromCoordinates(cumulativeCoordinates, mode);

    if (!currentHull) {
      return;
    }

    const sliceGeometry = getSliceGeometry(currentHull, previousHull);

    if (!sliceGeometry || !hasGeometry(sliceGeometry)) {
      previousHull = currentHull;
      return;
    }

    const colorRatio = getYearColorRatio(year, colorYearMin, colorYearMax);
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

/** Сбрасывает кеш срезов динамики ареала (для вида или полностью). */
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

/** Оставляет только срезы вплоть до выбранного года таймлайна. */
export function filterSlicesUpToYear(slices, maxYear) {
  return slices.filter((slice) => slice.year <= maxYear);
}
