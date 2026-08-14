/** Ключ фильтра вида в объекте locationFilters. */
export const SPECIES_SEARCH_FILTER_KEY = "__speciesSearch";

export const SPECIES_SEARCH_MIN_QUERY_LENGTH = 2;

export function normalizeSpeciesSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Нормализует фильтр поиска по виду.
 * Без выбранной латыни и при коротком запросе возвращает null (фильтр не активен).
 */
export function createSpeciesSearchFilter({ query = "", nameLatin = null } = {}) {
  const trimmedQuery = String(query ?? "").trim();
  const trimmedLatin =
    nameLatin != null && String(nameLatin).trim() !== ""
      ? String(nameLatin).trim()
      : null;

  if (!trimmedLatin && trimmedQuery.length < SPECIES_SEARCH_MIN_QUERY_LENGTH) {
    return null;
  }

  return {
    query: trimmedQuery,
    nameLatin: trimmedLatin
  };
}

export function isSpeciesSearchFilterActive(spec) {
  return Boolean(createSpeciesSearchFilter(spec ?? {}));
}

/** Совпадает ли точка с фильтром поиска по виду. */
export function featureMatchesSpeciesSearch(feature, spec) {
  const normalized = createSpeciesSearchFilter(spec ?? {});
  if (!normalized) {
    return true;
  }

  const latin = String(feature?.properties?.name_latin ?? "");
  const nameRu = String(feature?.properties?.name_ru ?? "");

  if (normalized.nameLatin) {
    return latin.toLowerCase() === normalized.nameLatin.toLowerCase();
  }

  const needle = normalizeSpeciesSearchText(normalized.query);
  if (!needle) {
    return true;
  }

  return latin.toLowerCase().includes(needle) || nameRu.toLowerCase().includes(needle);
}

function getSpeciesGroupKey(feature) {
  const latin = String(feature?.properties?.name_latin ?? "").trim();
  if (latin) {
    return `latin:${latin.toLowerCase()}`;
  }

  const nameRu = String(feature?.properties?.name_ru ?? "").trim();
  return `ru:${nameRu.toLowerCase()}`;
}

/**
 * Группирует точки в список видов для панели поиска.
 * @returns {{ key: string, nameLatin: string, nameRu: string, pointCount: number }[]}
 */
export function buildSpeciesSearchResults(features) {
  const groups = new Map();
  const list = Array.isArray(features) ? features : [];

  for (let i = 0; i < list.length; i += 1) {
    const feature = list[i];
    const key = getSpeciesGroupKey(feature);
    const existing = groups.get(key);
    if (existing) {
      existing.pointCount += 1;
      continue;
    }

    groups.set(key, {
      key,
      nameLatin: String(feature?.properties?.name_latin ?? "").trim(),
      nameRu: String(feature?.properties?.name_ru ?? "").trim(),
      pointCount: 1
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftLabel = left.nameRu || left.nameLatin;
    const rightLabel = right.nameRu || right.nameLatin;
    return leftLabel.localeCompare(rightLabel, "ru");
  });
}
