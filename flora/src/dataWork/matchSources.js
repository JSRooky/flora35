/**
 * Источники для поиска близких точек по виду.
 * Пары GBIF ↔ iNaturalist: основные слои и видимые временные слои.
 */

import {
  getStablePointKey,
  getVisibleGbifFeatures,
  getVisibleInatFeatures,
  getVisibleTempLayerToolFeatures
} from "../components/addLocationsLayer";

export const MATCH_SOURCE_IDS = {
  GBIF: "gbif",
  INATURALIST: "inaturalist"
};

/** Источники, участвующие в поиске сейчас. */
export const ACTIVE_MATCH_SOURCES = [
  MATCH_SOURCE_IDS.GBIF,
  MATCH_SOURCE_IDS.INATURALIST
];

/** Подписи для UI (как в попапах). */
export const MATCH_SOURCE_LABELS = {
  [MATCH_SOURCE_IDS.GBIF]: "GBIF",
  [MATCH_SOURCE_IDS.INATURALIST]: "iNaturalist"
};

/**
 * @param {string} sourceId
 * @returns {string}
 */
export function getMatchSourceLabel(sourceId) {
  return MATCH_SOURCE_LABELS[sourceId] ?? String(sourceId ?? "");
}

function appendUniqueFeatures(target, features, seenKeys) {
  if (!Array.isArray(features)) {
    return;
  }
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    const key = getStablePointKey(feature);
    if (!key || seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    target.push(feature);
  }
}

function isGbifMatchFeature(feature) {
  const properties = feature?.properties ?? {};
  return (
    properties.source === MATCH_SOURCE_IDS.GBIF ||
    (properties.gbif_key != null && properties.gbif_key !== "")
  );
}

function isInatMatchFeature(feature) {
  const properties = feature?.properties ?? {};
  return (
    properties.source === MATCH_SOURCE_IDS.INATURALIST ||
    (properties.inat_id != null && properties.inat_id !== "")
  );
}

/**
 * Точки GBIF и iNaturalist для «Близких точек»:
 * основные видимые слои плюс видимые временные слои (без дублей).
 * @returns {{ leftFeatures: object[], rightFeatures: object[] }}
 */
export function collectNearSpeciesSourceFeatures() {
  const leftFeatures = [];
  const rightFeatures = [];
  const seenLeft = new Set();
  const seenRight = new Set();

  appendUniqueFeatures(leftFeatures, getVisibleGbifFeatures(), seenLeft);
  appendUniqueFeatures(rightFeatures, getVisibleInatFeatures(), seenRight);

  const tempFeatures = getVisibleTempLayerToolFeatures();
  for (let index = 0; index < tempFeatures.length; index += 1) {
    const feature = tempFeatures[index];
    if (isGbifMatchFeature(feature)) {
      appendUniqueFeatures(leftFeatures, [feature], seenLeft);
    }
    if (isInatMatchFeature(feature)) {
      appendUniqueFeatures(rightFeatures, [feature], seenRight);
    }
  }

  return { leftFeatures, rightFeatures };
}
