import { normalizeHiddenRegionIds } from "./regionVisibility";

export const EXTERNAL_SOURCE_FILTER_MODES = {
  ALL: "all",
  GBIF: "gbif",
  INATURALIST: "inaturalist"
};

export function createDefaultExternalProcessingFilters() {
  return {
    sourceMode: EXTERNAL_SOURCE_FILTER_MODES.ALL,
    kingdomId: null,
    familyQuery: "",
    nameLatinQuery: "",
    hiddenRegionIds: []
  };
}

export function hasActiveExternalProcessingFilters(filters) {
  if (!filters) {
    return false;
  }

  return Boolean(
    (filters.sourceMode && filters.sourceMode !== EXTERNAL_SOURCE_FILTER_MODES.ALL) ||
      filters.kingdomId ||
      (filters.familyQuery || "").trim() ||
      (filters.nameLatinQuery || "").trim()
  );
}

function pickHiddenRegionIds(filters) {
  return normalizeHiddenRegionIds(filters?.hiddenRegionIds);
}

export function toGbifProcessingFiltersFromExternal(filters) {
  if (!filters || filters.sourceMode === EXTERNAL_SOURCE_FILTER_MODES.INATURALIST) {
    return {
      kingdomId: null,
      familyQuery: "",
      nameLatinQuery: "",
      hiddenRegionIds: pickHiddenRegionIds(filters)
    };
  }

  return {
    kingdomId: filters.kingdomId ?? null,
    familyQuery: filters.familyQuery ?? "",
    nameLatinQuery: filters.nameLatinQuery ?? "",
    hiddenRegionIds: pickHiddenRegionIds(filters)
  };
}

export function toInatProcessingFiltersFromExternal(filters) {
  if (!filters || filters.sourceMode === EXTERNAL_SOURCE_FILTER_MODES.GBIF) {
    return {
      kingdomId: null,
      familyQuery: "",
      nameLatinQuery: "",
      hiddenRegionIds: pickHiddenRegionIds(filters)
    };
  }

  return {
    kingdomId: filters.kingdomId ?? null,
    familyQuery: filters.familyQuery ?? "",
    nameLatinQuery: filters.nameLatinQuery ?? "",
    hiddenRegionIds: pickHiddenRegionIds(filters)
  };
}
