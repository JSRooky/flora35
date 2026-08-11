import { getHaversineDistanceKm } from "../geo/getHaversineDistanceKm";
import { getMatchSourceLabel } from "./matchSources";
import { normalizeLatinName } from "./normalizeLatinName";

/**
 * @typedef {{
 *   source: string,
 *   nameLatin: string,
 *   coordinates: [number, number],
 *   feature: object
 * }} MatchPoint
 * @typedef {{
 *   nameLatin: string,
 *   left: MatchPoint,
 *   right: MatchPoint,
 *   distanceMeters: number
 * }} NearSpeciesMatch
 * @typedef {{
 *   key: string,
 *   nameLatin: string,
 *   coordinates: [number, number],
 *   source: string,
 *   feature: object
 * }} IndexedPoint
 */

/** Примерно метров на градус широты. */
const METERS_PER_DEG_LAT = 111320;

function isValidCoordinates(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  );
}

/**
 * @param {object} feature
 * @param {string} sourceId
 * @returns {IndexedPoint|null}
 */
function toIndexedPoint(feature, sourceId) {
  const nameLatinRaw = feature?.properties?.name_latin;
  const key = normalizeLatinName(nameLatinRaw);
  const coordinates = feature?.geometry?.coordinates;

  if (!key || !isValidCoordinates(coordinates)) {
    return null;
  }

  const nameLatin =
    typeof nameLatinRaw === "string" ? nameLatinRaw.trim().replace(/\s+/g, " ") : key;

  return {
    key,
    nameLatin,
    coordinates: [coordinates[0], coordinates[1]],
    source: sourceId,
    feature
  };
}

/**
 * @param {object[]} features
 * @param {string} sourceId
 * @returns {Map<string, IndexedPoint[]>}
 */
function groupByLatinName(features, sourceId) {
  const groups = new Map();

  if (!Array.isArray(features)) {
    return groups;
  }

  for (const feature of features) {
    const point = toIndexedPoint(feature, sourceId);
    if (!point) {
      continue;
    }

    const list = groups.get(point.key);
    if (list) {
      list.push(point);
    } else {
      groups.set(point.key, [point]);
    }
  }

  return groups;
}

/**
 * @param {IndexedPoint} point
 * @returns {MatchPoint}
 */
function toMatchPoint(point) {
  return {
    source: point.source,
    nameLatin: point.nameLatin,
    coordinates: point.coordinates,
    feature: point.feature
  };
}

/**
 * Нижняя граница индекса в массиве, отсортированном по lat: lat >= minLat.
 * @param {IndexedPoint[]} sortedByLat
 * @param {number} minLat
 * @returns {number}
 */
function lowerBoundByLat(sortedByLat, minLat) {
  let lo = 0;
  let hi = sortedByLat.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedByLat[mid].coordinates[1] < minLat) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

/**
 * Верхняя граница индекса: lat <= maxLat (первый индекс с lat > maxLat).
 * @param {IndexedPoint[]} sortedByLat
 * @param {number} maxLat
 * @returns {number}
 */
function upperBoundByLat(sortedByLat, maxLat) {
  let lo = 0;
  let hi = sortedByLat.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedByLat[mid].coordinates[1] <= maxLat) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

/**
 * Грубая bbox-проверка в метрах до Haversine.
 * @param {[number, number]} leftCoords
 * @param {[number, number]} rightCoords
 * @param {number} thresholdMeters
 * @param {number} latDeltaDeg
 * @returns {boolean}
 */
function passesBboxPrefilter(leftCoords, rightCoords, thresholdMeters, latDeltaDeg) {
  const dLat = Math.abs(leftCoords[1] - rightCoords[1]);
  if (dLat > latDeltaDeg) {
    return false;
  }

  if (dLat * METERS_PER_DEG_LAT > thresholdMeters) {
    return false;
  }

  const cosLat = Math.cos((leftCoords[1] * Math.PI) / 180);
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.max(0.01, Math.abs(cosLat));
  const dLng = Math.abs(leftCoords[0] - rightCoords[0]);

  return dLng * metersPerDegLng <= thresholdMeters;
}

/**
 * Сопоставляет две группы одного вида: сортировка по lat + bbox, затем Haversine.
 * @param {IndexedPoint[]} leftPoints
 * @param {IndexedPoint[]} rightPoints
 * @param {number} thresholdMeters
 * @param {NearSpeciesMatch[]} matches
 */
function collectMatchesForSpecies(leftPoints, rightPoints, thresholdMeters, matches) {
  const latDeltaDeg = thresholdMeters / METERS_PER_DEG_LAT;
  const sortedRight = [...rightPoints].sort(
    (a, b) => a.coordinates[1] - b.coordinates[1]
  );

  for (const left of leftPoints) {
    const leftLat = left.coordinates[1];
    const start = lowerBoundByLat(sortedRight, leftLat - latDeltaDeg);
    const end = upperBoundByLat(sortedRight, leftLat + latDeltaDeg);

    for (let index = start; index < end; index += 1) {
      const right = sortedRight[index];

      if (
        !passesBboxPrefilter(
          left.coordinates,
          right.coordinates,
          thresholdMeters,
          latDeltaDeg
        )
      ) {
        continue;
      }

      const distanceMeters =
        getHaversineDistanceKm(left.coordinates, right.coordinates) * 1000;

      if (distanceMeters > thresholdMeters) {
        continue;
      }

      matches.push({
        nameLatin: left.nameLatin,
        left: toMatchPoint(left),
        right: toMatchPoint(right),
        distanceMeters
      });
    }
  }
}

/**
 * @param {NearSpeciesMatch[]} matches
 */
function sortMatches(matches) {
  matches.sort((a, b) => {
    const nameCmp = a.nameLatin.localeCompare(b.nameLatin, "en", { sensitivity: "base" });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.distanceMeters - b.distanceMeters;
  });
}

/**
 * Ищет пары точек из двух источников с одинаковым латинским названием
 * и расстоянием ≤ thresholdMeters.
 *
 * @param {{
 *   leftFeatures: object[],
 *   rightFeatures: object[],
 *   thresholdMeters: number,
 *   leftSourceId?: string,
 *   rightSourceId?: string
 * }} options
 * @returns {NearSpeciesMatch[]}
 */
export function findNearSpeciesMatches({
  leftFeatures,
  rightFeatures,
  thresholdMeters,
  leftSourceId = "gbif",
  rightSourceId = "inaturalist"
}) {
  const threshold = Number(thresholdMeters);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return [];
  }

  const leftGroups = groupByLatinName(leftFeatures, leftSourceId);
  const rightGroups = groupByLatinName(rightFeatures, rightSourceId);
  /** @type {NearSpeciesMatch[]} */
  const matches = [];

  for (const [key, leftPoints] of leftGroups) {
    const rightPoints = rightGroups.get(key);
    if (!rightPoints || rightPoints.length === 0) {
      continue;
    }

    collectMatchesForSpecies(leftPoints, rightPoints, threshold, matches);
  }

  sortMatches(matches);
  return matches;
}

/**
 * Тот же поиск, но с паузами между пачками видов — UI не зависает.
 *
 * @param {{
 *   leftFeatures: object[],
 *   rightFeatures: object[],
 *   thresholdMeters: number,
 *   leftSourceId?: string,
 *   rightSourceId?: string
 * }} options
 * @param {{
 *   signal?: { aborted?: boolean },
 *   speciesPerChunk?: number
 * }} [asyncOptions]
 * @returns {Promise<NearSpeciesMatch[]>}
 */
export async function findNearSpeciesMatchesAsync(
  options,
  { signal = null, speciesPerChunk = 8 } = {}
) {
  const threshold = Number(options?.thresholdMeters);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return [];
  }

  const leftGroups = groupByLatinName(options.leftFeatures, options.leftSourceId ?? "gbif");
  const rightGroups = groupByLatinName(
    options.rightFeatures,
    options.rightSourceId ?? "inaturalist"
  );
  /** @type {NearSpeciesMatch[]} */
  const matches = [];

  const sharedKeys = [];
  for (const key of leftGroups.keys()) {
    const rightPoints = rightGroups.get(key);
    if (rightPoints && rightPoints.length > 0) {
      sharedKeys.push(key);
    }
  }

  const chunkSize = Math.max(1, Number(speciesPerChunk) || 8);

  for (let offset = 0; offset < sharedKeys.length; offset += chunkSize) {
    if (signal?.aborted) {
      return [];
    }

    const slice = sharedKeys.slice(offset, offset + chunkSize);
    for (const key of slice) {
      collectMatchesForSpecies(
        leftGroups.get(key),
        rightGroups.get(key),
        threshold,
        matches
      );
    }

    if (offset + chunkSize < sharedKeys.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (signal?.aborted) {
    return [];
  }

  sortMatches(matches);
  return matches;
}

/**
 * Форматирует координаты [lng, lat] как «lat, lng».
 * @param {[number, number]|number[]|null|undefined} coordinates
 * @param {number} [fractionDigits=5]
 * @returns {string}
 */
export function formatMatchCoordinates(coordinates, fractionDigits = 5) {
  if (!isValidCoordinates(coordinates)) {
    return "—";
  }

  const [lng, lat] = coordinates;
  return `${lat.toFixed(fractionDigits)}, ${lng.toFixed(fractionDigits)}`;
}

/**
 * @param {number} distanceMeters
 * @returns {string}
 */
export function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "—";
  }

  if (distanceMeters < 1) {
    return distanceMeters.toFixed(1);
  }

  return String(Math.round(distanceMeters));
}

export { getMatchSourceLabel };
