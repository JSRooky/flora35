/** Состояние фильтров панели «Обработка данных GBIF» по умолчанию. */
export function createDefaultGbifProcessingFilters() {
  return {
    kingdomId: null,
    familyQuery: "",
    nameLatinQuery: ""
  };
}

/** Есть ли активные фильтры обработки GBIF. */
export function hasActiveGbifProcessingFilters(filters) {
  if (!filters) {
    return false;
  }

  return Boolean(
    filters.kingdomId ||
      (filters.familyQuery || "").trim() ||
      (filters.nameLatinQuery || "").trim()
  );
}

/**
 * Клиентская фильтрация загруженного GBIF-слоя:
 * царство (точное), семейство и латынь (подстрока без учёта регистра).
 */
export function applyGbifProcessingFilters(features, filters = null) {
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }

  if (!hasActiveGbifProcessingFilters(filters)) {
    return features;
  }

  const kingdomId = filters.kingdomId || null;
  const familyNeedle = (filters.familyQuery || "").trim().toLowerCase();
  const latinNeedle = (filters.nameLatinQuery || "").trim().toLowerCase();

  return features.filter((feature) => {
    const props = feature?.properties ?? {};

    if (kingdomId && props.regnum !== kingdomId) {
      return false;
    }

    if (familyNeedle) {
      const family = String(props.family ?? "").toLowerCase();
      if (!family.includes(familyNeedle)) {
        return false;
      }
    }

    if (latinNeedle) {
      const nameLatin = String(props.name_latin ?? "").toLowerCase();
      if (!nameLatin.includes(latinNeedle)) {
        return false;
      }
    }

    return true;
  });
}
