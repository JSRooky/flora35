export const REGION_SPECIES_ALLOWLIST_KEY = "__regionSpeciesAllowlist";

export function speciesDisplayKey({ nameLatin = "", nameRu = "" } = {}) {
  const latin = String(nameLatin ?? "").trim().toLowerCase();
  if (latin) {
    return `latin:${latin}`;
  }
  const ru = String(nameRu ?? "").trim().toLowerCase();
  return ru ? `ru:${ru}` : "";
}

export function featureSpeciesDisplayKey(feature) {
  return speciesDisplayKey({
    nameLatin: feature?.properties?.name_latin,
    nameRu: feature?.properties?.name_ru
  });
}

/**
 * Компилирует allowlist в предикат: ключи видов считаются один раз на фильтр.
 * Раньше ключ каждого вида пересчитывался заново для каждой точки
 * (N точек × M видов строковых операций).
 * @param {Array<{nameLatin?: string, nameRu?: string}>|unknown} allowlist
 * @returns {((feature: object) => boolean) | null} `null`, если фильтр не активен
 */
export function createRegionSpeciesAllowlistPredicate(allowlist) {
  if (!Array.isArray(allowlist)) {
    return null;
  }
  if (allowlist.length === 0) {
    return () => false;
  }

  const allowed = new Set();
  for (let i = 0; i < allowlist.length; i += 1) {
    const key = speciesDisplayKey(allowlist[i]);
    if (key) {
      allowed.add(key);
    }
  }

  return (feature) => {
    const key = featureSpeciesDisplayKey(feature);
    return Boolean(key) && allowed.has(key);
  };
}

export function featureMatchesRegionSpeciesAllowlist(feature, allowlist) {
  const predicate = createRegionSpeciesAllowlistPredicate(allowlist);
  return predicate ? predicate(feature) : true;
}
