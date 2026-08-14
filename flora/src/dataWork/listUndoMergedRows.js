import { getMatchSourceLabel } from "./matchSources";
import { formatMatchCoordinates } from "./findNearSpeciesMatches";

/**
 * @param {object|null|undefined} feature
 * @returns {object[]}
 */
export function parseMergedFromFeature(feature) {
  const raw = feature?.properties?.merged_from_json;
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {object|null|undefined} feature
 * @returns {string}
 */
export function getMergedFeatureId(feature) {
  return String(feature?.id ?? feature?.properties?.merged_id ?? "").trim();
}

/**
 * Строка таблицы «Отменить слияние».
 * @param {object} feature
 * @returns {{
 *   id: string,
 *   nameLatin: string,
 *   foundYear: string,
 *   coordinatesLabel: string,
 *   coordinates: number[]|null,
 *   sourcesLabel: string,
 *   mergedFrom: object[],
 *   feature: object
 * }|null}
 */
export function toUndoMergedRow(feature) {
  const id = getMergedFeatureId(feature);
  if (!id) {
    return null;
  }

  const properties = feature?.properties ?? {};
  const mergedFrom = parseMergedFromFeature(feature);
  const coordinates = Array.isArray(feature?.geometry?.coordinates)
    ? feature.geometry.coordinates
    : null;
  const foundYear =
    properties.found_year == null || properties.found_year === ""
      ? "не указан"
      : String(properties.found_year);

  const sourcesLabel =
    mergedFrom.length > 0
      ? mergedFrom
          .map((entry) => getMatchSourceLabel(entry?.source))
          .filter(Boolean)
          .join(" ↔ ")
      : "—";

  return {
    id,
    nameLatin: properties.name_latin || "Без названия",
    foundYear,
    coordinatesLabel: formatMatchCoordinates(coordinates),
    coordinates,
    sourcesLabel,
    mergedFrom,
    feature
  };
}

/**
 * @param {object[]} features
 * @returns {ReturnType<typeof toUndoMergedRow>[]}
 */
export function listUndoMergedRows(features) {
  return (features || [])
    .map((feature) => toUndoMergedRow(feature))
    .filter(Boolean)
    .sort((left, right) =>
      String(left.nameLatin).localeCompare(String(right.nameLatin), "ru", {
        sensitivity: "base"
      })
    );
}
