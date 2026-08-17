import { getFeatureCollection, getFeatureCacheVersion } from "../locations/loadPoints";
import { getGbifColumnarTable, getGbifFeatureCount } from "../gbif/gbifStore";
import { getInatColumnarTable, getInatFeatureCount } from "../inaturalist/inatStore";
import { foldGbifYearBounds } from "../gbif/gbifColumnar";
import { foldInatYearBounds } from "../inaturalist/inatColumnar";
import { getMergedFeatures } from "./addMergedLayer";
import { getRedBookFeatures } from "./addRedBookLayer";
import {
  getTempLayerStaging,
  getTempLayers
} from "../tempLayers/tempLayerStore";

let cachedYearBounds = null;
let cachedYearBoundsKey = "";

/** Запасной диапазон, пока точки ещё не загружены (не схлопываем в один год). */
function getFallbackYearBounds() {
  const currentYear = new Date().getFullYear();
  return { min: 1950, max: currentYear };
}

/** Год находки из свойства точки: число или строка; иначе null. */
export function parseFoundYear(value) {
  if (value == null || value === "") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.trunc(numeric);
}

/**
 * Обновляет min/max по found_year без промежуточного массива и без
 * Math.min(...huge) — иначе при сотнях тысяч точек падает call stack.
 */
function foldYearBounds(features, bounds) {
  let { min, max, any } = bounds;

  for (const feature of features ?? []) {
    const year = parseFoundYear(feature.properties?.found_year);
    if (year == null) {
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

function foldTempLayerYearBounds(bounds) {
  let next = foldYearBounds(getTempLayerStaging()?.features, bounds);
  const layers = getTempLayers();
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    if (!layer?.visible) {
      continue;
    }
    next = foldYearBounds(layer.features, next);
  }
  return next;
}

function countVisibleTempLayerFeatures() {
  let count = getTempLayerStaging()?.features?.length ?? 0;
  const layers = getTempLayers();
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    if (layer?.visible) {
      count += layer.features?.length ?? 0;
    }
  }
  return count;
}

function sourcesCacheKey(sources) {
  return [
    sources.includeLocal ? "L" : "",
    sources.includeGbif ? "G" : "",
    sources.includeInat ? "I" : "",
    sources.includeMerged ? "M" : "",
    sources.includeRedBook ? "R" : "",
    sources.includeTemp ? "T" : ""
  ].join("");
}

/**
 * Минимальный и максимальный год находки среди данных видимых слоёв.
 * Пока годов нет — 1950…текущий год (а не один «текущий» год).
 */
export function getYearBounds(sources = {}) {
  const scoped = Boolean(sources && Object.keys(sources).length > 0);
  const includeLocal = scoped ? Boolean(sources.includeLocal) : true;
  const includeGbif = scoped ? Boolean(sources.includeGbif) : true;
  const includeInat = scoped ? Boolean(sources.includeInat) : true;
  const includeMerged = scoped ? Boolean(sources.includeMerged) : true;
  const includeRedBook = scoped ? Boolean(sources.includeRedBook) : true;
  const includeTemp = scoped ? Boolean(sources.includeTemp) : true;

  const cacheVersion = getFeatureCacheVersion();
  const gbifCount = includeGbif ? getGbifFeatureCount() : 0;
  const inatCount = includeInat ? getInatFeatureCount() : 0;
  const mergedCount = includeMerged ? getMergedFeatures()?.length ?? 0 : 0;
  const redBookCount = includeRedBook ? getRedBookFeatures()?.length ?? 0 : 0;
  const tempCount = includeTemp ? countVisibleTempLayerFeatures() : 0;
  const cacheKey = [
    sourcesCacheKey({
      includeLocal,
      includeGbif,
      includeInat,
      includeMerged,
      includeRedBook,
      includeTemp
    }),
    cacheVersion,
    gbifCount,
    inatCount,
    mergedCount,
    redBookCount,
    tempCount
  ].join(":");

  if (cachedYearBounds && cachedYearBoundsKey === cacheKey) {
    return cachedYearBounds;
  }

  let bounds = { min: null, max: null, any: false };
  if (includeLocal) {
    bounds = foldYearBounds(getFeatureCollection().features, bounds);
  }
  if (includeGbif) {
    bounds = foldGbifYearBounds(getGbifColumnarTable(), bounds);
  }
  if (includeInat) {
    bounds = foldInatYearBounds(getInatColumnarTable(), bounds);
  }
  if (includeMerged) {
    bounds = foldYearBounds(getMergedFeatures(), bounds);
  }
  if (includeRedBook) {
    bounds = foldYearBounds(getRedBookFeatures(), bounds);
  }
  if (includeTemp) {
    bounds = foldTempLayerYearBounds(bounds);
  }

  cachedYearBounds = bounds.any
    ? { min: bounds.min, max: bounds.max }
    : getFallbackYearBounds();
  cachedYearBoundsKey = cacheKey;
  return cachedYearBounds;
}
