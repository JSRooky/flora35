/**
 * Источники для поиска близких точек по виду.
 * MVP: только внешние (GBIF ↔ iNaturalist).
 * Позже сюда можно добавить локальные и выбор подмножества.
 */

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
