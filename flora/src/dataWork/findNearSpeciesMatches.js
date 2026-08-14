import { getHaversineDistanceKm } from "../geo/getHaversineDistanceKm";
import { getMatchSourceLabel } from "./matchSources";
import { normalizeLatinName } from "./normalizeLatinName";

/**
 * @typedef {{
 *   source: string,
 *   nameLatin: string,
 *   coordinates: [number, number],
 *   foundYear: number|null,
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
 *   foundYear: number|null,
 *   source: string,
 *   feature: object
 * }} IndexedPoint
 */

/** Примерно метров на градус широты. */
const METERS_PER_DEG_LAT = 111320;

/**
 * Нормализует год находки до целого числа или null.
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizeFoundYear(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.trunc(numeric);
}

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
    foundYear: normalizeFoundYear(feature?.properties?.found_year),
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
 * Группировка по нормализованной латыни напрямую по колонкам (без FeatureCollection).
 * @param {{
 *   rowCount: number,
 *   getNameLatin: (rowIndex: number) => string|null,
 *   getLng: (rowIndex: number) => number,
 *   getLat: (rowIndex: number) => number,
 *   getFoundYear: (rowIndex: number) => unknown,
 *   sourceId: string,
 *   getFeature: (rowIndex: number) => object
 * }} table
 * @returns {Map<string, IndexedPoint[]>}
 */
export function groupColumnarByLatinName(table) {
  const groups = new Map();
  const rowCount = table?.rowCount ?? 0;

  for (let i = 0; i < rowCount; i += 1) {
    const nameLatinRaw = table.getNameLatin(i);
    const key = normalizeLatinName(nameLatinRaw);
    const lng = table.getLng(i);
    const lat = table.getLat(i);

    if (!key || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }

    const nameLatin =
      typeof nameLatinRaw === "string" ? nameLatinRaw.trim().replace(/\s+/g, " ") : key;

    const point = {
      key,
      nameLatin,
      coordinates: [lng, lat],
      foundYear: normalizeFoundYear(table.getFoundYear(i)),
      source: table.sourceId,
      feature: table.getFeature(i)
    };

    const list = groups.get(key);
    if (list) {
      list.push(point);
    } else {
      groups.set(key, [point]);
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
    foundYear: point.foundYear ?? null,
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
 * @param {number|null} [maxMatches]
 * @returns {boolean} true, если достигнут лимит maxMatches
 */
function collectMatchesForSpecies(
  leftPoints,
  rightPoints,
  thresholdMeters,
  matches,
  maxMatches = null
) {
  const latDeltaDeg = thresholdMeters / METERS_PER_DEG_LAT;
  const sortedRight = [...rightPoints].sort(
    (a, b) => a.coordinates[1] - b.coordinates[1]
  );
  const hasLimit =
    Number.isFinite(maxMatches) && maxMatches != null && maxMatches >= 0;

  for (const left of leftPoints) {
    const leftLat = left.coordinates[1];
    const start = lowerBoundByLat(sortedRight, leftLat - latDeltaDeg);
    const end = upperBoundByLat(sortedRight, leftLat + latDeltaDeg);

    for (let index = start; index < end; index += 1) {
      if (hasLimit && matches.length >= maxMatches) {
        return true;
      }

      const right = sortedRight[index];

      if (
        left.foundYear != null &&
        right.foundYear != null &&
        left.foundYear !== right.foundYear
      ) {
        continue;
      }

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

  return hasLimit && matches.length >= maxMatches;
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
 * Если у обеих точек указан год находки — он тоже должен совпадать;
 * если год не указан хотя бы у одной — пара всё равно учитывается.
 *
 * @param {{
 *   leftFeatures: object[],
 *   rightFeatures: object[],
 *   thresholdMeters: number,
 *   leftSourceId?: string,
 *   rightSourceId?: string,
 *   maxMatches?: number|null
 * }} options
 * @returns {NearSpeciesMatch[]}
 */
export function findNearSpeciesMatches({
  leftFeatures,
  rightFeatures,
  leftColumnar = null,
  rightColumnar = null,
  thresholdMeters,
  leftSourceId = "gbif",
  rightSourceId = "inaturalist",
  maxMatches = null
}) {
  const threshold = Number(thresholdMeters);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return [];
  }

  const limit =
    Number.isFinite(maxMatches) && maxMatches != null && maxMatches >= 0
      ? Math.floor(maxMatches)
      : null;

  const leftGroups = leftColumnar
    ? groupColumnarByLatinName({ ...leftColumnar, sourceId: leftSourceId })
    : groupByLatinName(leftFeatures, leftSourceId);
  const rightGroups = rightColumnar
    ? groupColumnarByLatinName({ ...rightColumnar, sourceId: rightSourceId })
    : groupByLatinName(rightFeatures, rightSourceId);
  /** @type {NearSpeciesMatch[]} */
  const matches = [];

  for (const [key, leftPoints] of leftGroups) {
    const rightPoints = rightGroups.get(key);
    if (!rightPoints || rightPoints.length === 0) {
      continue;
    }

    const hitLimit = collectMatchesForSpecies(
      leftPoints,
      rightPoints,
      threshold,
      matches,
      limit
    );
    if (hitLimit) {
      break;
    }
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
 *   rightSourceId?: string,
 *   maxMatches?: number|null
 * }} options
 * @param {{
 *   signal?: { aborted?: boolean },
 *   speciesPerChunk?: number
 * }} [asyncOptions]
 * @returns {Promise<{ matches: NearSpeciesMatch[], truncated: boolean }>}
 */
export async function findNearSpeciesMatchesAsync(
  options,
  { signal = null, speciesPerChunk = 8 } = {}
) {
  const threshold = Number(options?.thresholdMeters);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { matches: [], truncated: false };
  }

  const limit =
    Number.isFinite(options?.maxMatches) &&
    options.maxMatches != null &&
    options.maxMatches >= 0
      ? Math.floor(options.maxMatches)
      : null;

  const leftGroups = options.leftColumnar
    ? groupColumnarByLatinName({
        ...options.leftColumnar,
        sourceId: options.leftSourceId ?? "gbif"
      })
    : groupByLatinName(options.leftFeatures, options.leftSourceId ?? "gbif");
  const rightGroups = options.rightColumnar
    ? groupColumnarByLatinName({
        ...options.rightColumnar,
        sourceId: options.rightSourceId ?? "inaturalist"
      })
    : groupByLatinName(
        options.rightFeatures,
        options.rightSourceId ?? "inaturalist"
      );
  /** @type {NearSpeciesMatch[]} */
  const matches = [];
  let truncated = false;

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
      return { matches: [], truncated: false };
    }

    const slice = sharedKeys.slice(offset, offset + chunkSize);
    for (const key of slice) {
      const hitLimit = collectMatchesForSpecies(
        leftGroups.get(key),
        rightGroups.get(key),
        threshold,
        matches,
        limit
      );
      if (hitLimit) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }

    if (offset + chunkSize < sharedKeys.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (signal?.aborted) {
    return { matches: [], truncated: false };
  }

  sortMatches(matches);
  return { matches, truncated };
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
