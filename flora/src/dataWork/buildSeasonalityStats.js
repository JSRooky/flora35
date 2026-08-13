import { getFoundMonth } from "../geo/foundDate";
import { normalizeLatinName } from "./normalizeLatinName";

const MONTH_COUNT = 12;
const COORD_STEP = 0.01;

/**
 * @typedef {{
 *   nameLatin: string,
 *   total: number,
 *   withMonth: number,
 *   unknownMonth: number,
 *   byMonth: number[]
 * }} SeasonalityStats
 */

/**
 * @typedef {{
 *   latMin: number,
 *   latMax: number,
 *   lonMin: number,
 *   lonMax: number
 * }} SeasonalityGeoBounds
 */

/**
 * @typedef {{
 *   latMin?: number,
 *   latMax?: number,
 *   lonMin?: number,
 *   lonMax?: number
 * }} SeasonalityGeoFilter
 */

/**
 * @param {object|null|undefined} feature
 * @returns {{ lon: number, lat: number }|null}
 */
export function getFeatureLonLat(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  return { lon, lat };
}

/**
 * @param {SeasonalityGeoFilter|null|undefined} filter
 * @param {{ lon: number, lat: number }} coords
 * @returns {boolean}
 */
function matchesGeoFilter(filter, coords) {
  if (!filter) {
    return true;
  }

  const { latMin, latMax, lonMin, lonMax } = filter;
  if (latMin != null && coords.lat < latMin) {
    return false;
  }
  if (latMax != null && coords.lat > latMax) {
    return false;
  }
  if (lonMin != null && coords.lon < lonMin) {
    return false;
  }
  if (lonMax != null && coords.lon > lonMax) {
    return false;
  }

  return true;
}

/**
 * Округление границ координат до шага ползунка.
 * @param {number} value
 * @param {"floor"|"ceil"} mode
 * @returns {number}
 */
function snapCoord(value, mode) {
  const scaled = value / COORD_STEP;
  const snapped = mode === "ceil" ? Math.ceil(scaled) : Math.floor(scaled);
  return Number((snapped * COORD_STEP).toFixed(2));
}

/**
 * Границы координат находок вида (для ползунков широтного анализа).
 * @param {object[]} features
 * @param {string|null|undefined} nameLatin
 * @returns {SeasonalityGeoBounds|null}
 */
export function buildSeasonalityCoordinateBounds(features, nameLatin) {
  const key = normalizeLatinName(nameLatin);
  if (!key) {
    return null;
  }

  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let count = 0;

  (features ?? []).forEach((feature) => {
    const featureKey = normalizeLatinName(feature?.properties?.name_latin);
    if (!featureKey || featureKey !== key) {
      return;
    }

    const coords = getFeatureLonLat(feature);
    if (!coords) {
      return;
    }

    count += 1;
    latMin = Math.min(latMin, coords.lat);
    latMax = Math.max(latMax, coords.lat);
    lonMin = Math.min(lonMin, coords.lon);
    lonMax = Math.max(lonMax, coords.lon);
  });

  if (count === 0) {
    return null;
  }

  const bounds = {
    latMin: snapCoord(latMin, "floor"),
    latMax: snapCoord(latMax, "ceil"),
    lonMin: snapCoord(lonMin, "floor"),
    lonMax: snapCoord(lonMax, "ceil")
  };

  if (bounds.latMin === bounds.latMax) {
    bounds.latMin = snapCoord(bounds.latMin - COORD_STEP, "floor");
    bounds.latMax = snapCoord(bounds.latMax + COORD_STEP, "ceil");
  }

  if (bounds.lonMin === bounds.lonMax) {
    bounds.lonMin = snapCoord(bounds.lonMin - COORD_STEP, "floor");
    bounds.lonMax = snapCoord(bounds.lonMax + COORD_STEP, "ceil");
  }

  return bounds;
}

/**
 * Статистика находок по месяцам для вида (по name_latin).
 * @param {object[]} features
 * @param {string|null|undefined} nameLatin
 * @param {SeasonalityGeoFilter|null|undefined} [geoFilter]
 * @returns {SeasonalityStats|null}
 */
export function buildSeasonalityStats(features, nameLatin, geoFilter = null) {
  const key = normalizeLatinName(nameLatin);
  if (!key) {
    return null;
  }

  const displayLatin =
    typeof nameLatin === "string" ? nameLatin.trim().replace(/\s+/g, " ") : key;

  const byMonth = Array.from({ length: MONTH_COUNT }, () => 0);
  let total = 0;
  let withMonth = 0;
  let unknownMonth = 0;

  (features ?? []).forEach((feature) => {
    const featureKey = normalizeLatinName(feature?.properties?.name_latin);
    if (!featureKey || featureKey !== key) {
      return;
    }

    if (geoFilter) {
      const coords = getFeatureLonLat(feature);
      if (!coords || !matchesGeoFilter(geoFilter, coords)) {
        return;
      }
    }

    total += 1;
    const month = getFoundMonth(feature);
    if (month == null) {
      unknownMonth += 1;
      return;
    }

    byMonth[month - 1] += 1;
    withMonth += 1;
  });

  return {
    nameLatin: displayLatin,
    total,
    withMonth,
    unknownMonth,
    byMonth
  };
}

export const SEASONALITY_COORD_STEP = COORD_STEP;
