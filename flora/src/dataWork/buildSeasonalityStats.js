import { getFoundMonth } from "../geo/foundDate";
import { normalizeLatinName } from "./normalizeLatinName";

const MONTH_COUNT = 12;

/**
 * @typedef {{
 *   nameLatin: string,
 *   total: number,
 *   withMonth: number,
 *   unknownMonth: number,
 *   byMonth: number[]
 * }} SeasonalityStats
 */

/**
 * Статистика находок по месяцам для вида (по name_latin).
 * @param {object[]} features
 * @param {string|null|undefined} nameLatin
 * @returns {SeasonalityStats|null}
 */
export function buildSeasonalityStats(features, nameLatin) {
  const key = normalizeLatinName(nameLatin);
  if (!key) {
    return null;
  }

  const displayLatin =
    typeof nameLatin === "string" ? nameLatin.trim().replace(/\s+/g, " ") : key;

  const byMonth = Array.from({ length: MONTH_COUNT }, () => 0);
  let total = 0;
  let withMonth = 0;
  let unknownMonth = 0;

  (features ?? []).forEach((feature) => {
    const featureKey = normalizeLatinName(feature?.properties?.name_latin);
    if (!featureKey || featureKey !== key) {
      return;
    }

    total += 1;
    const month = getFoundMonth(feature);
    if (month == null) {
      unknownMonth += 1;
      return;
    }

    byMonth[month - 1] += 1;
    withMonth += 1;
  });

  return {
    nameLatin: displayLatin,
    total,
    withMonth,
    unknownMonth,
    byMonth
  };
}
