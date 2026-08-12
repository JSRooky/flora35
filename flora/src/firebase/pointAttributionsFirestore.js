/** Коллекция Firestore: ручные правки атрибуции точек (без атрибуции). */
export const POINT_ATTRIBUTIONS_COLLECTION = "point_attributions";

/**
 * Id документа = стабильный ключ точки (gbif-… / inat-… / finding_id).
 * @param {string} pointKey
 * @returns {string}
 */
export function buildPointAttributionDocId(pointKey) {
  return String(pointKey ?? "").trim();
}
