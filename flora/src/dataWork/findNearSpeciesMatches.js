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
 */

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
 * @returns {{ key: string, nameLatin: string, coordinates: [number, number], source: string, feature: object }|null}
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
 * @returns {Map<string, ReturnType<typeof toIndexedPoint>[]>}
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

    for (const left of leftPoints) {
      for (const right of rightPoints) {
        const distanceKm = getHaversineDistanceKm(left.coordinates, right.coordinates);
        const distanceMeters = distanceKm * 1000;

        if (distanceMeters > threshold) {
          continue;
        }

        matches.push({
          nameLatin: left.nameLatin,
          left: {
            source: left.source,
            nameLatin: left.nameLatin,
            coordinates: left.coordinates,
            feature: left.feature
          },
          right: {
            source: right.source,
            nameLatin: right.nameLatin,
            coordinates: right.coordinates,
            feature: right.feature
          },
          distanceMeters
        });
      }
    }
  }

  matches.sort((a, b) => {
    const nameCmp = a.nameLatin.localeCompare(b.nameLatin, "en", { sensitivity: "base" });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.distanceMeters - b.distanceMeters;
  });

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
