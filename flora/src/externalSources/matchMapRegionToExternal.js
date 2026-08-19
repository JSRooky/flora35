import { EXTERNAL_REGIONS } from "./regions";

function normalizeRegionName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

function catalogKeys(entry) {
  return [entry?.name, entry?.nameEn, entry?.iso]
    .map(normalizeRegionName)
    .filter(Boolean);
}

function regionKeys(region) {
  return [region?.label, region?.labelEn, region?.id]
    .map(normalizeRegionName)
    .filter(Boolean);
}

function namesMatch(left, right) {
  return left === right || (left.length >= 5 && right.includes(left)) || (right.length >= 5 && left.includes(right));
}

/** Сопоставляет субъект с карты с регионом загрузки GBIF/iNat. */
export function matchMapRegionToExternal(entry) {
  const keys = catalogKeys(entry);
  if (!keys.length) {
    return null;
  }
  return (
    EXTERNAL_REGIONS.find((region) => {
      const targets = regionKeys(region);
      return keys.some((key) => targets.some((target) => namesMatch(key, target)));
    }) ?? null
  );
}

export function matchMapRegionsToExternal(entries = []) {
  const matched = [];
  const unmatched = [];
  const seen = new Set();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const region = matchMapRegionToExternal(entry);
    if (!region) {
      unmatched.push(entry?.name || entry?.iso || "Регион");
      return;
    }
    if (seen.has(region.id)) {
      return;
    }
    seen.add(region.id);
    matched.push({ region, feature: entry?.feature ?? null, entry });
  });

  return { matched, unmatched };
}
