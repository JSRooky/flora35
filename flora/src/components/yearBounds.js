import { getFeatureCollection, getFeatureCacheVersion } from "../locations/loadPoints";
import { getGbifFeatureCollection } from "../gbif/gbifStore";
import { getInatFeatureCollection } from "../inaturalist/inatStore";

let cachedYearBounds = null;
let cachedYearBoundsVersion = -1;
let cachedYearBoundsGbifCount = -1;
let cachedYearBoundsInatCount = -1;

/** Запасной диапазон, пока точки ещё не загружены (не схлопываем в один год). */
function getFallbackYearBounds() {
  const currentYear = new Date().getFullYear();
  return { min: 1950, max: currentYear };
}

function collectYears(features) {
  const years = [];

  for (const feature of features ?? []) {
    const year = feature.properties?.found_year;
    if (typeof year === "number" && Number.isFinite(year)) {
      years.push(year);
    }
  }

  return years;
}

/**
 * Минимальный и максимальный год находки среди локальных точек и загруженных
 * внешних источников (GBIF, iNaturalist).
 * Пока данных нет — 1950…текущий год (а не один «текущий» год).
 */
export function getYearBounds() {
  const cacheVersion = getFeatureCacheVersion();
  const gbifCount = getGbifFeatureCollection().features?.length ?? 0;
  const inatCount = getInatFeatureCollection().features?.length ?? 0;

  if (
    cachedYearBounds &&
    cachedYearBoundsVersion === cacheVersion &&
    cachedYearBoundsGbifCount === gbifCount &&
    cachedYearBoundsInatCount === inatCount
  ) {
    return cachedYearBounds;
  }

  const years = [
    ...collectYears(getFeatureCollection().features),
    ...collectYears(getGbifFeatureCollection().features),
    ...collectYears(getInatFeatureCollection().features)
  ];

  if (years.length === 0) {
    cachedYearBounds = getFallbackYearBounds();
  } else {
    cachedYearBounds = {
      min: Math.min(...years),
      max: Math.max(...years)
    };
  }

  cachedYearBoundsVersion = cacheVersion;
  cachedYearBoundsGbifCount = gbifCount;
  cachedYearBoundsInatCount = inatCount;
  return cachedYearBounds;
}
