import {
  readGbifFamily,
  readGbifNameLatin,
  readGbifRegionId,
  readGbifRegnum
} from "./gbifColumnar";
import { allRowIndices } from "../externalSources/columnarSnapshot";
import {
  createHiddenRegionSet,
  isRegionIdHidden
} from "../externalSources/regionVisibility";

/** Состояние фильтров панели «Обработка данных GBIF» по умолчанию. */
export function createDefaultGbifProcessingFilters() {
  return {
    kingdomId: null,
    familyQuery: "",
    nameLatinQuery: "",
    hiddenRegionIds: []
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
      (filters.nameLatinQuery || "").trim() ||
      (Array.isArray(filters.hiddenRegionIds) && filters.hiddenRegionIds.length > 0)
  );
}

function rowMatchesGbifFilters(
  table,
  rowIndex,
  kingdomId,
  familyNeedle,
  latinNeedle,
  hiddenSet
) {
  if (isRegionIdHidden(readGbifRegionId(table, rowIndex), hiddenSet)) {
    return false;
  }

  if (kingdomId && readGbifRegnum(table, rowIndex) !== kingdomId) {
    return false;
  }

  if (familyNeedle) {
    const family = String(readGbifFamily(table, rowIndex) ?? "").toLowerCase();
    if (!family.includes(familyNeedle)) {
      return false;
    }
  }

  if (latinNeedle) {
    const nameLatin = String(readGbifNameLatin(table, rowIndex) ?? "").toLowerCase();
    if (!nameLatin.includes(latinNeedle)) {
      return false;
    }
  }

  return true;
}

/**
 * Индексы строк колоночной таблицы GBIF, прошедших фильтры обработки.
 */
export function filterGbifTableIndices(table, filters = null) {
  const rowCount = table?.rowCount ?? 0;
  if (rowCount === 0) {
    return [];
  }

  if (!hasActiveGbifProcessingFilters(filters)) {
    return allRowIndices(rowCount);
  }

  const kingdomId = filters.kingdomId || null;
  const familyNeedle = (filters.familyQuery || "").trim().toLowerCase();
  const latinNeedle = (filters.nameLatinQuery || "").trim().toLowerCase();
  const hiddenSet = createHiddenRegionSet(filters);
  const indices = [];

  for (let i = 0; i < rowCount; i += 1) {
    if (rowMatchesGbifFilters(table, i, kingdomId, familyNeedle, latinNeedle, hiddenSet)) {
      indices.push(i);
    }
  }

  return indices;
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
  const hiddenSet = createHiddenRegionSet(filters);

  return features.filter((feature) => {
    const props = feature?.properties ?? {};

    if (isRegionIdHidden(props.region_id, hiddenSet)) {
      return false;
    }

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
