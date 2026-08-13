import {
  readInatFamily,
  readInatNameLatin,
  readInatRegionId,
  readInatRegnum
} from "./inatColumnar";
import { allRowIndices } from "../externalSources/columnarSnapshot";
import {
  createHiddenRegionSet,
  isRegionIdHidden
} from "../externalSources/regionVisibility";

/** Состояние фильтров обработки iNaturalist по умолчанию. */
export function createDefaultInatProcessingFilters() {
  return {
    kingdomId: null,
    familyQuery: "",
    nameLatinQuery: "",
    hiddenRegionIds: []
  };
}

export function hasActiveInatProcessingFilters(filters) {
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

function rowMatchesInatFilters(
  table,
  rowIndex,
  kingdomId,
  familyNeedle,
  latinNeedle,
  hiddenSet
) {
  if (isRegionIdHidden(readInatRegionId(table, rowIndex), hiddenSet)) {
    return false;
  }

  if (kingdomId && readInatRegnum(table, rowIndex) !== kingdomId) {
    return false;
  }

  if (familyNeedle) {
    const family = String(readInatFamily(table, rowIndex) ?? "").toLowerCase();
    if (!family.includes(familyNeedle)) {
      return false;
    }
  }

  if (latinNeedle) {
    const nameLatin = String(readInatNameLatin(table, rowIndex) ?? "").toLowerCase();
    if (!nameLatin.includes(latinNeedle)) {
      return false;
    }
  }

  return true;
}

export function filterInatTableIndices(table, filters = null) {
  const rowCount = table?.rowCount ?? 0;
  if (rowCount === 0) {
    return [];
  }

  if (!hasActiveInatProcessingFilters(filters)) {
    return allRowIndices(rowCount);
  }

  const kingdomId = filters.kingdomId || null;
  const familyNeedle = (filters.familyQuery || "").trim().toLowerCase();
  const latinNeedle = (filters.nameLatinQuery || "").trim().toLowerCase();
  const hiddenSet = createHiddenRegionSet(filters);
  const indices = [];

  for (let i = 0; i < rowCount; i += 1) {
    if (rowMatchesInatFilters(table, i, kingdomId, familyNeedle, latinNeedle, hiddenSet)) {
      indices.push(i);
    }
  }

  return indices;
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
