import { PROPERTY_LABELS } from "../components/featurePropertyLabels";
import { getFeatureCoordinates } from "../components/spreadCoincidentPoints";

/** Поля, отсутствие любого из которых = «без атрибуции». */
export const ATTRIBUTION_FIELDS = [
  "regnum",
  "family",
  "name_latin",
  "found_year"
];

const POINT_SOURCE_LABELS = {
  gbif: "GBIF",
  inaturalist: "iNaturalist",
  local: "Flora",
  flora: "Flora",
  merged: "Слияние"
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmptyAttr(value) {
  return value == null || value === "";
}

/**
 * @param {string|null|undefined} sourceId
 * @returns {string}
 */
export function getPointSourceLabel(sourceId) {
  if (!sourceId) {
    return POINT_SOURCE_LABELS.flora;
  }

  return POINT_SOURCE_LABELS[sourceId] ?? String(sourceId);
}

/**
 * @param {string} fieldKey
 * @returns {string}
 */
export function getAttributionFieldLabel(fieldKey) {
  return PROPERTY_LABELS[fieldKey] ?? fieldKey;
}

/**
 * @param {object|null|undefined} feature
 * @returns {string[]}
 */
export function getMissingAttributionFields(feature) {
  const properties = feature?.properties ?? {};
  return ATTRIBUTION_FIELDS.filter((field) => isEmptyAttr(properties[field]));
}

/**
 * @param {number[]|null|undefined} coordinates [lng, lat]
 * @returns {string}
 */
export function formatPointCoordinates(coordinates) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return "—";
  }

  return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

/**
 * @param {string[]} missingFields
 * @returns {string}
 */
export function formatMissingFields(missingFields) {
  if (!Array.isArray(missingFields) || missingFields.length === 0) {
    return "—";
  }

  return missingFields.map(getAttributionFieldLabel).join(", ");
}

/**
 * @param {object} feature
 * @returns {{
 *   feature: object,
 *   source: string,
 *   missingFields: string[],
 *   coordinates: number[],
 *   displayName: string
 * }|null}
 */
function toUnattributedRow(feature) {
  const missingFields = getMissingAttributionFields(feature);
  if (missingFields.length === 0) {
    return null;
  }

  const coordinates = getFeatureCoordinates(feature);
  if (!coordinates) {
    return null;
  }

  const properties = feature?.properties ?? {};
  const source = properties.source || "flora";
  const displayName =
    (typeof properties.name_latin === "string" && properties.name_latin.trim()) ||
    (typeof properties.name_ru === "string" && properties.name_ru.trim()) ||
    "Без названия";

  return {
    feature,
    source,
    missingFields,
    coordinates,
    displayName
  };
}

/**
 * @param {object[]} features
 * @returns {Array<{
 *   feature: object,
 *   source: string,
 *   missingFields: string[],
 *   coordinates: number[],
 *   displayName: string
 * }>}
 */
export function findUnattributedPoints(features) {
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }

  /** @type {ReturnType<typeof toUnattributedRow>[]} */
  const rows = [];

  for (const feature of features) {
    const row = toUnattributedRow(feature);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Поиск с паузами по пачкам — UI не зависает на больших выборках.
 *
 * @param {object[]} features
 * @param {{
 *   signal?: { aborted?: boolean },
 *   chunkSize?: number
 * }} [asyncOptions]
 * @returns {Promise<ReturnType<typeof findUnattributedPoints>>}
 */
export async function findUnattributedPointsAsync(
  features,
  { signal = null, chunkSize = 500 } = {}
) {
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }

  const size = Math.max(1, Number(chunkSize) || 500);
  /** @type {ReturnType<typeof findUnattributedPoints>} */
  const rows = [];

  for (let offset = 0; offset < features.length; offset += size) {
    if (signal?.aborted) {
      return [];
    }

    const slice = features.slice(offset, offset + size);
    for (const feature of slice) {
      const row = toUnattributedRow(feature);
      if (row) {
        rows.push(row);
      }
    }

    if (offset + size < features.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return rows;
}
