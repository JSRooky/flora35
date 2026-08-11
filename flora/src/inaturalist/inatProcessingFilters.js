/** Состояние фильтров обработки iNaturalist по умолчанию. */
export function createDefaultInatProcessingFilters() {
  return {
    kingdomId: null,
    familyQuery: "",
    nameLatinQuery: ""
  };
}

export function hasActiveInatProcessingFilters(filters) {
  if (!filters) {
    return false;
  }

  return Boolean(
    filters.kingdomId ||
      (filters.familyQuery || "").trim() ||
      (filters.nameLatinQuery || "").trim()
  );
}

export function applyInatProcessingFilters(features, filters = null) {
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }

  if (!hasActiveInatProcessingFilters(filters)) {
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
