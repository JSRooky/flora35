/** Коллекция Firestore для точек, полученных слиянием дубликатов. */
export const MERGED_POINTS_COLLECTION = "merged_points";

/**
 * Стабильный id документа: merged__{leftKey}__{rightKey}.
 * @param {string} leftKey
 * @param {string} rightKey
 * @returns {string}
 */
export function buildMergedDocId(leftKey, rightKey) {
  const left = String(leftKey ?? "").replace(/[^\w.-]+/g, "-");
  const right = String(rightKey ?? "").replace(/[^\w.-]+/g, "-");
  return `merged__${left}__${right}`;
}
