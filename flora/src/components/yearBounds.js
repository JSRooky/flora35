import { getFeatureCollection, getFeatureCacheVersion } from "../locations/loadPoints";
import { getGbifColumnarTable, getGbifFeatureCount } from "../gbif/gbifStore";
import { getInatColumnarTable, getInatFeatureCount } from "../inaturalist/inatStore";
import { foldGbifYearBounds } from "../gbif/gbifColumnar";
import { foldInatYearBounds } from "../inaturalist/inatColumnar";
import { getMergedFeatures } from "./addMergedLayer";
import { getRedBookFeatures } from "./addRedBookLayer";

let cachedYearBounds = null;
let cachedYearBoundsVersion = -1;
let cachedYearBoundsGbifCount = -1;
let cachedYearBoundsInatCount = -1;
let cachedYearBoundsMergedCount = -1;
let cachedYearBoundsRedBookCount = -1;

/** Запасной диапазон, пока точки ещё не загружены (не схлопываем в один год). */
function getFallbackYearBounds() {
  const currentYear = new Date().getFullYear();
  return { min: 1950, max: currentYear };
}

/**
 * Обновляет min/max по found_year без промежуточного массива и без
 * Math.min(...huge) — иначе при сотнях тысяч точек падает call stack.
 */
function foldYearBounds(features, bounds) {
  let { min, max, any } = bounds;

  for (const feature of features ?? []) {
    const year = feature.properties?.found_year;
    if (typeof year !== "number" || !Number.isFinite(year)) {
      continue;
    }
    if (!any) {
      min = year;
      max = year;
      any = true;
      continue;
    }
    if (year < min) {
      min = year;
    }
    if (year > max) {
      max = year;
    }
  }

  return { min, max, any };
}

/**
 * Минимальный и максимальный год находки среди локальных точек и загруженных
 * внешних источников (GBIF, iNaturalist, merged, Красная книга).
 * Пока данных нет — 1950…текущий год (а не один «текущий» год).
 */
export function getYearBounds() {
  const cacheVersion = getFeatureCacheVersion();
  const gbifCount = getGbifFeatureCount();
  const inatCount = getInatFeatureCount();
  const mergedFeatures = getMergedFeatures();
  const redBookFeatures = getRedBookFeatures();
  const mergedCount = mergedFeatures?.length ?? 0;
  const redBookCount = redBookFeatures?.length ?? 0;

  if (
    cachedYearBounds &&
    cachedYearBoundsVersion === cacheVersion &&
    cachedYearBoundsGbifCount === gbifCount &&
    cachedYearBoundsInatCount === inatCount &&
    cachedYearBoundsMergedCount === mergedCount &&
    cachedYearBoundsRedBookCount === redBookCount
  ) {
    return cachedYearBounds;
  }

  let bounds = { min: null, max: null, any: false };
  bounds = foldYearBounds(getFeatureCollection().features, bounds);
  bounds = foldGbifYearBounds(getGbifColumnarTable(), bounds);
  bounds = foldInatYearBounds(getInatColumnarTable(), bounds);
  bounds = foldYearBounds(mergedFeatures, bounds);
  bounds = foldYearBounds(redBookFeatures, bounds);

  cachedYearBounds = bounds.any
    ? { min: bounds.min, max: bounds.max }
    : getFallbackYearBounds();

  cachedYearBoundsVersion = cacheVersion;
  cachedYearBoundsGbifCount = gbifCount;
  cachedYearBoundsInatCount = inatCount;
  cachedYearBoundsMergedCount = mergedCount;
  cachedYearBoundsRedBookCount = redBookCount;
  return cachedYearBounds;
}
