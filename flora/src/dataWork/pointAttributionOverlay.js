import { ATTRIBUTION_FIELDS, isEmptyAttr } from "./findUnattributedPoints";

/** @type {Map<string, Record<string, unknown>>} */
let attributionByPointKey = new Map();

/**
 * @param {Iterable<[string, Record<string, unknown>]>|Record<string, Record<string, unknown>>|null|undefined} entries
 */
export function setAttributionOverlays(entries) {
  attributionByPointKey = new Map();

  if (!entries) {
    return;
  }

  if (entries instanceof Map || Array.isArray(entries)) {
    for (const [key, attrs] of entries) {
      if (key && attrs && typeof attrs === "object") {
        attributionByPointKey.set(String(key), { ...attrs });
      }
    }
    return;
  }

  Object.entries(entries).forEach(([key, attrs]) => {
    if (key && attrs && typeof attrs === "object") {
      attributionByPointKey.set(String(key), { ...attrs });
    }
  });
}

/**
 * @param {string} pointKey
 * @param {Record<string, unknown>} attributes
 */
export function upsertAttributionOverlay(pointKey, attributes) {
  if (!pointKey || !attributes || typeof attributes !== "object") {
    return;
  }

  const key = String(pointKey);
  const prev = attributionByPointKey.get(key) ?? {};
  const next = { ...prev };

  ATTRIBUTION_FIELDS.forEach((field) => {
    if (!isEmptyAttr(attributes[field])) {
      next[field] = attributes[field];
    }
  });

  attributionByPointKey.set(key, next);
}

/**
 * @param {string} pointKey
 * @returns {Record<string, unknown>|null}
 */
export function getAttributionOverlay(pointKey) {
  if (!pointKey) {
    return null;
  }

  return attributionByPointKey.get(String(pointKey)) ?? null;
}

/**
 * Накладывает сохранённые атрибуты на feature (без мутации исходника).
 * @param {object|null|undefined} feature
 * @param {(feature: object) => string} getPointKey
 * @returns {object|null|undefined}
 */
export function enrichFeatureWithAttribution(feature, getPointKey) {
  if (!feature || typeof getPointKey !== "function") {
    return feature;
  }

  const key = getPointKey(feature);
  const overlay = getAttributionOverlay(key);
  if (!overlay) {
    return feature;
  }

  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      ...overlay
    }
  };
}

/**
 * @param {object[]} features
 * @param {(feature: object) => string} getPointKey
 * @returns {object[]}
 */
export function enrichFeaturesWithAttribution(features, getPointKey) {
  if (!Array.isArray(features) || features.length === 0) {
    return features ?? [];
  }

  return features.map((feature) => enrichFeatureWithAttribution(feature, getPointKey));
}
