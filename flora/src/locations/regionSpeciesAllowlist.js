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

export function featureMatchesRegionSpeciesAllowlist(feature, allowlist) {
  if (!Array.isArray(allowlist)) {
    return true;
  }
  if (allowlist.length === 0) {
    return false;
  }
  const key = featureSpeciesDisplayKey(feature);
  if (!key) {
    return false;
  }
  return allowlist.some((item) => speciesDisplayKey(item) === key);
}
