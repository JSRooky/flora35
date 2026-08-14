/**
 * Нормализация даты находки до месяца (1–12) для сезонности.
 * Не выводит месяц из одного только года.
 */

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function toMonthNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const month = Math.trunc(numeric);
  if (month < 1 || month > 12) {
    return null;
  }

  return month;
}

/**
 * Месяц из отдельных полей year/month/day (GBIF occurrence, iNat details).
 * @param {{ year?: unknown, month?: unknown, day?: unknown }} parts
 * @returns {number|null} 1..12
 */
export function parseFoundMonthFromParts(parts = {}) {
  return toMonthNumber(parts.month);
}

/**
 * Месяц из строковой даты / интервала.
 * Для диапазонов GBIF (`2008-05-01/2008-05-03`) берётся начало.
 * Поддерживает `YYYY-MM-DD`, `YYYY-MM`, ISO datetime.
 * @param {unknown} value
 * @returns {number|null} 1..12
 */
export function parseFoundMonthFromDateString(value) {
  if (value == null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  // Интервал: берём левую границу.
  const start = raw.includes("/") ? raw.split("/")[0].trim() : raw;
  if (!start) {
    return null;
  }

  // YYYY-MM или YYYY-MM-DD (с опциональным временем)
  const match = start.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T\s].*)?$/);
  if (match) {
    return toMonthNumber(match[2]);
  }

  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // getUTCMonth — чтобы ISO с Z не смещал месяц локальной зоной.
  return parsed.getUTCMonth() + 1;
}

/**
 * Месяц находки из properties точки.
 * @param {object|null|undefined} feature
 * @returns {number|null} 1..12
 */
export function getFoundMonth(feature) {
  const props = feature?.properties;
  if (!props) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(props, "found_month")) {
    return toMonthNumber(props.found_month);
  }

  return null;
}
