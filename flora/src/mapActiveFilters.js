import { MODULE_IDS } from "./components/ModuleMenu";
import { hasActiveExternalProcessingFilters } from "./externalSources/externalProcessingFilters";
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
  /** @deprecated */
  GBIF_PROCESSING: "external-processing"
};

const TOOL_FILTER_PANEL_LABELS = {
  [MODULE_IDS.AREAL]: "Радиус",
  [MODULE_IDS.BUFFER]: "Буфер",
  [MODULE_IDS.POLYGON]: "Полигон",
  [MODULE_IDS.AREA]: "Область"
};

function toolFilterId(moduleId) {
  return `tool:${moduleId}`;
}

/**
 * Активные фильтры карты, сгруппированные по панелям, где они задаются.
 * @returns {{ id: string, label: string }[]}
 */
export function collectActiveMapFilters({
  propertyFilters,
  statusFilters,
  regnumFilters,
  yearFilterEnabled,
  toolPointsFilterEnabled,
  boundsSpeciesRegnumFilter,
  denseClustersHighlight,
  denseProcessingActive,
  externalProcessingFilters,
  hiddenPointKeys
}) {
  const entries = [];

  if (Object.keys(propertyFilters || {}).length > 0) {
    entries.push({
      id: MAP_FILTER_IDS.FEATURE,
      label: "Сведения о точке данных"
    });
  }

  if ((regnumFilters || []).length > 0) {
    entries.push({
      id: MAP_FILTER_IDS.REGNUM,
      label: "Царство"
    });
  }

  if ((statusFilters || []).length > 0) {
    entries.push({
      id: MAP_FILTER_IDS.STATUS,
      label: "Статус (МСОП)"
    });
  }

  if (yearFilterEnabled) {
    entries.push({
      id: MAP_FILTER_IDS.YEAR,
      label: "Год находки"
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
      label: "Виды внутри выбранной ООПТ"
    });
  }

  // Подсветка плотных групп и «Только эти» у «Групп точек» — одна панель.
  if (denseClustersHighlight || toolPointsFilterEnabled?.[MODULE_IDS.MAP]) {
    entries.push({
      id: MAP_FILTER_IDS.MAP_GROUPS,
      label: "Группы точек"
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
      label: "Обработка внешних данных"
    });
  }

  const hiddenCount = Array.isArray(hiddenPointKeys) ? hiddenPointKeys.length : 0;
  if (hiddenCount > 0) {
    entries.push({
      id: MAP_FILTER_IDS.HIDDEN_POINTS,
      label: `Скрытые точки (${hiddenCount})`
    });
  }

  return entries;
}
