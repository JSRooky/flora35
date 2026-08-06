import { getFeatureCollection, getFeatureCacheVersion } from "../locations/loadPoints";

let cachedYearBounds = null;
let cachedYearBoundsVersion = -1;

/** Минимальный и максимальный год находки среди всех точек данных. */
export function getYearBounds() {
  const cacheVersion = getFeatureCacheVersion();

  if (cachedYearBounds && cachedYearBoundsVersion === cacheVersion) {
    return cachedYearBounds;
  }

  const years = getFeatureCollection().features
    .map((feature) => feature.properties?.found_year)
    .filter((year) => typeof year === "number" && Number.isFinite(year));

  if (years.length === 0) {
    const currentYear = new Date().getFullYear();
    cachedYearBounds = { min: currentYear, max: currentYear };
  } else {
    cachedYearBounds = {
      min: Math.min(...years),
      max: Math.max(...years)
    };
  }

  cachedYearBoundsVersion = cacheVersion;
  return cachedYearBounds;
}
