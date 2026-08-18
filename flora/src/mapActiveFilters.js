import { MODULE_IDS } from "./components/ModuleMenu";
import {
  formatPropertyValue,
  getPropertyLabel,
  getRegnumLabel
} from "./components/featurePropertyLabels";
import { STATUS_OPTIONS } from "./components/StatusFilterPanel";
import {
  EXTERNAL_SOURCE_FILTER_MODES,
  hasActiveExternalProcessingFilters
} from "./externalSources/externalProcessingFilters";
import {
  hasHiddenRegionFilter,
  normalizeHiddenRegionIds
} from "./externalSources/regionVisibility";
import { getGbifKingdomById } from "./gbif/taxonFilters";
import { TOOL_POINTS_FILTER_MODULES } from "./toolPointsFilterStorage";

/** Идентификаторы источников фильтра карты (по панелям). */
export const MAP_FILTER_IDS = {
  FEATURE: "feature",
  STATUS: "status",
  REGNUM: "regnum",
  YEAR: "year",
  OOPT_FEATURE: "oopt-feature",
  OOPT_SPECIES: "oopt-species",
  MAP_GROUPS: "map-groups",
  DENSE: "dense",
  EXTERNAL_PROCESSING: "external-processing",
  HIDDEN_POINTS: "hidden-points",
  SEARCH: "search",
  REGION_VISIBILITY: "region-visibility",
  /** @deprecated */
  GBIF_PROCESSING: "external-processing"
};

const TOOL_FILTER_PANEL_LABELS = {
  [MODULE_IDS.AREAL]: "Радиус",
  [MODULE_IDS.BUFFER]: "Буфер",
  [MODULE_IDS.POLYGON]: "Полигон",
  [MODULE_IDS.AREA]: "Область"
};

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.map(({ code, label }) => [code, label])
);

function toolFilterId(moduleId) {
  return `tool:${moduleId}`;
}

function formatYearRange(range) {
  if (!range || typeof range !== "object") {
    return "";
  }
  const min = range.min;
  const max = range.max;
  if (min == null && max == null) {
    return "";
  }
  if (min != null && max != null) {
    return min === max ? String(min) : `${min}–${max}`;
  }
  if (min != null) {
    return `от ${min}`;
  }
  return `до ${max}`;
}

function formatNamedValue(key, value) {
  if (value == null || value === "") {
    return "";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const range = formatYearRange(value);
    return range ? `${getPropertyLabel(key)}: ${range}` : "";
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (key === "regnum") {
          return getRegnumLabel(item);
        }
        if (key === "status") {
          return STATUS_LABELS[item] || String(item);
        }
        return formatPropertyValue(key, item);
      })
      .filter(Boolean);
    return parts.length ? `${getPropertyLabel(key)}: ${parts.join(", ")}` : "";
  }
  if (key === "regnum") {
    return `${getPropertyLabel(key)}: ${getRegnumLabel(value)}`;
  }
  if (key === "status") {
    return `${getPropertyLabel(key)}: ${STATUS_LABELS[value] || String(value)}`;
  }
  return `${getPropertyLabel(key)}: ${formatPropertyValue(key, value)}`;
}

function propertyFilterDetails(propertyFilters) {
  return Object.entries(propertyFilters || {})
    .map(([key, value]) => formatNamedValue(key, value))
    .filter(Boolean);
}

function statusFilterDetails(statusFilters) {
  return (statusFilters || [])
    .map((code) => STATUS_LABELS[code] || String(code))
    .filter(Boolean);
}

function regnumFilterDetails(regnumFilters) {
  return (regnumFilters || []).map((value) => getRegnumLabel(value)).filter(Boolean);
}

function externalProcessingDetails(filters) {
  if (!filters) {
    return [];
  }
  const details = [];
  if (filters.sourceMode === EXTERNAL_SOURCE_FILTER_MODES.GBIF) {
    details.push("Источник: GBIF");
  } else if (filters.sourceMode === EXTERNAL_SOURCE_FILTER_MODES.INATURALIST) {
    details.push("Источник: iNaturalist");
  }
  if (filters.kingdomId) {
    const kingdom = getGbifKingdomById(filters.kingdomId);
    details.push(`Царство: ${kingdom?.label || filters.kingdomId}`);
  }
  const familyQuery = String(filters.familyQuery || "").trim();
  if (familyQuery) {
    details.push(`Семейство: ${familyQuery}`);
  }
  const nameLatinQuery = String(filters.nameLatinQuery || "").trim();
  if (nameLatinQuery) {
    details.push(`Латынь: ${nameLatinQuery}`);
  }
  return details;
}

function speciesSearchDetails({ query, nameLatin }) {
  const latin = String(nameLatin || "").trim();
  if (latin) {
    return [latin];
  }
  const text = String(query || "").trim();
  return text ? [text] : [];
}

function ooptSpeciesDetails(boundsSpeciesRegnumFilter) {
  if (!Array.isArray(boundsSpeciesRegnumFilter)) {
    return [];
  }
  if (boundsSpeciesRegnumFilter.length === 0) {
    return ["царства отключены"];
  }
  return [`царства: ${boundsSpeciesRegnumFilter.map(getRegnumLabel).join(", ")}`];
}

/**
 * Активные фильтры карты, сгруппированные по панелям, где они задаются.
 * @returns {{ id: string, label: string, details?: string[] }[]}
 */
export function collectActiveMapFilters({
  propertyFilters,
  statusFilters,
  regnumFilters,
  yearFilterEnabled,
  yearRange,
  hideMissingFoundYear,
  toolPointsFilterEnabled,
  boundsSpeciesRegnumFilter,
  denseClustersHighlight,
  denseProcessingActive,
  externalProcessingFilters,
  hiddenPointKeys,
  speciesSearchActive,
  speciesSearchQuery,
  speciesSearchSelectedLatin
}) {
  const entries = [];

  const featureDetails = propertyFilterDetails(propertyFilters);
  if (featureDetails.length > 0) {
    entries.push({
      id: MAP_FILTER_IDS.FEATURE,
      label: "О точке",
      details: featureDetails
    });
  }

  const regnumDetails = regnumFilterDetails(regnumFilters);
  if (regnumDetails.length > 0) {
    entries.push({
      id: MAP_FILTER_IDS.REGNUM,
      label: "Царство",
      details: regnumDetails
    });
  }

  const statusDetails = statusFilterDetails(statusFilters);
  if (statusDetails.length > 0) {
    entries.push({
      id: MAP_FILTER_IDS.STATUS,
      label: "Статус",
      details: statusDetails
    });
  }

  if (yearFilterEnabled) {
    const yearText = formatYearRange(yearRange);
    entries.push({
      id: MAP_FILTER_IDS.YEAR,
      label: "Год находки",
      details: yearText ? [yearText] : []
    });
  } else if (hideMissingFoundYear) {
    entries.push({
      id: MAP_FILTER_IDS.YEAR,
      label: "Без года скрыты"
    });
  }

  if (toolPointsFilterEnabled?.[MODULE_IDS.OOPT]) {
    entries.push({
      id: MAP_FILTER_IDS.OOPT_FEATURE,
      label: "Сведения об ООПТ"
    });
  }

  TOOL_POINTS_FILTER_MODULES.forEach((moduleId) => {
    if (moduleId === MODULE_IDS.OOPT || moduleId === MODULE_IDS.MAP) {
      return;
    }

    if (!toolPointsFilterEnabled?.[moduleId]) {
      return;
    }

    entries.push({
      id: toolFilterId(moduleId),
      label: TOOL_FILTER_PANEL_LABELS[moduleId] || moduleId
    });
  });

  if (boundsSpeciesRegnumFilter != null) {
    entries.push({
      id: MAP_FILTER_IDS.OOPT_SPECIES,
      label: "Виды внутри выбранной ООПТ",
      details: ooptSpeciesDetails(boundsSpeciesRegnumFilter)
    });
  }

  // Подсветка плотных групп и «Только эти» у «Групп точек» — одна панель.
  if (denseClustersHighlight || toolPointsFilterEnabled?.[MODULE_IDS.MAP]) {
    const details = [];
    if (denseClustersHighlight) {
      details.push("подсветка плотных групп");
    }
    if (toolPointsFilterEnabled?.[MODULE_IDS.MAP]) {
      details.push("только точки выбранных групп");
    }
    entries.push({
      id: MAP_FILTER_IDS.MAP_GROUPS,
      label: "Группы точек",
      details
    });
  }

  if (denseProcessingActive) {
    entries.push({
      id: MAP_FILTER_IDS.DENSE,
      label: "Обработка плотных групп"
    });
  }

  if (hasActiveExternalProcessingFilters(externalProcessingFilters)) {
    entries.push({
      id: MAP_FILTER_IDS.EXTERNAL_PROCESSING,
      label: "Обработка внешних данных",
      details: externalProcessingDetails(externalProcessingFilters)
    });
  }

  if (hasHiddenRegionFilter(externalProcessingFilters)) {
    const hiddenRegions = normalizeHiddenRegionIds(
      externalProcessingFilters?.hiddenRegionIds
    ).length;
    entries.push({
      id: MAP_FILTER_IDS.REGION_VISIBILITY,
      label: "Фильтр регионов",
      details: [`скрыто регионов: ${hiddenRegions}`]
    });
  }

  const hiddenCount = Array.isArray(hiddenPointKeys) ? hiddenPointKeys.length : 0;
  if (hiddenCount > 0) {
    entries.push({
      id: MAP_FILTER_IDS.HIDDEN_POINTS,
      label: `Скрытые точки (${hiddenCount})`
    });
  }

  if (speciesSearchActive) {
    entries.push({
      id: MAP_FILTER_IDS.SEARCH,
      label: "Поиск по виду",
      details: speciesSearchDetails({
        query: speciesSearchQuery,
        nameLatin: speciesSearchSelectedLatin
      })
    });
  }

  return entries;
}
