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

function exactMatch(left, right) {
  return left === right;
}

function fuzzyMatch(left, right) {
  return (left.length >= 5 && right.includes(left)) || (right.length >= 5 && left.includes(right));
}

/** Сопоставляет субъект с карты с регионом загрузки GBIF/iNat. */
export function matchMapRegionToExternal(entry) {
  const keys = catalogKeys(entry);
  if (!keys.length) {
    return null;
  }

  // Точное совпадение по нормализованному имени/ISO проверяем первым, чтобы
  // не подобрать похожий по подстроке чужой регион (например, «Алтай» →
  // «Алтайский край» вместо «Республика Алтай»).
  const exact = EXTERNAL_REGIONS.find((region) => {
    const targets = regionKeys(region);
    return keys.some((key) => targets.some((target) => exactMatch(key, target)));
  });
  if (exact) {
    return exact;
  }

  return (
    EXTERNAL_REGIONS.find((region) => {
      const targets = regionKeys(region);
      return keys.some((key) => targets.some((target) => fuzzyMatch(key, target)));
    }) ?? null
  );
}

export function matchMapRegionsToExternal(entries = []) {
  const matched = [];
  const unmatched = [];
  const byRegionId = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const region = matchMapRegionToExternal(entry);
    if (!region) {
      unmatched.push(entry?.name || entry?.iso || "Регион");
      return;
    }
    const existing = byRegionId.get(region.id);
    if (existing) {
      // Несколько субъектов карты сопоставились с одним внешним регионом
      // (например, составной регион из нескольких частей) — не теряем
      // геометрию остальных частей, а объединяем их.
      if (entry?.feature) {
        existing.features.push(entry.feature);
      }
      return;
    }
    const record = {
      region,
      feature: entry?.feature ?? null,
      features: entry?.feature ? [entry.feature] : [],
      entry
    };
    byRegionId.set(region.id, record);
    matched.push(record);
  });

  return { matched, unmatched };
}
