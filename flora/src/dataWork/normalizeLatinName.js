/**
 * Нормализует латинское название вида для сравнения:
 * trim, сжатие пробелов, нижний регистр.
 * @param {unknown} value
 * @returns {string|null} Нормализованная строка или null, если пусто.
 */
export function normalizeLatinName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
