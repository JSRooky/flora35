/**
 * Блочные константы и хелперы карты, вынесенные из `App.js`.
 *
 * Здесь только значения, не зависящие от React-состояния: идентификаторы
 * панелей, значения по умолчанию и чистые функции над ними. Модуль не имеет
 * побочных эффектов и может импортироваться любым доменом.
 */

/** Идентификаторы панелей приложения. */
export const PANEL_IDS = {
  FEATURE: "feature",
  AREAL: "areal",
  STATUS: "status",
  REGNUM: "regnum",
  MAP: "map",
  DENSE: "dense",
  YEAR: "year",
  SEASONALITY: "seasonality",
  POLYGON: "polygon",
  BUFFER: "buffer",
  AREA: "area",
  OOPT: "oopt",
  REGIONS: "regions",
  OOPT_FEATURE: "oopt-feature",
  SUBMIT: "submit",
  DATA_SOURCES: "data-sources",
  EXTERNAL_PROCESSING: "external-processing",
  DATA_WORK: "data-work",
  SEARCH: "search",
  REDBOOK: "redbook",
  TEMP_ARCHIVE: "temp-archive",
  SETTINGS: "settings",
  COMPARE: "compare",
  REPORT: "report",
  ANALYSIS: "analysis",
  COMPARE_DIVERSITY: "compare-diversity",
  COMPARE_SIMILARITY: "compare-similarity",
  COMPARE_DISTRIBUTION: "compare-distribution",
  COMPARE_STATS: "compare-stats",
  REGION_SPECIES: "region-species",
  /** @deprecated алиасы для taskbar */
  GBIF: "data-sources",
  GBIF_PROCESSING: "external-processing"
};

export const DEFAULT_CLUSTERING_ENABLED = true;
export const DEFAULT_CLUSTER_BY_REGNUM = false;
export const DEFAULT_CLUSTER_PIE_CHARTS = false;
export const LOCATION_FILTERS_DEBOUNCE_MS = 90;
export const SPECIES_SEARCH_DEBOUNCE_MS = 250;
export const DEFAULT_DENSE_CLUSTERS_HIGHLIGHT = false;
export const DEFAULT_MARKERS_VISIBLE = true;

/** Панели, которые сворачиваем при развороте «Сведений о точке». */
export const FEATURE_PEER_PANEL_IDS = [
  PANEL_IDS.AREAL,
  PANEL_IDS.STATUS,
  PANEL_IDS.MAP,
  PANEL_IDS.DENSE,
  PANEL_IDS.YEAR,
  PANEL_IDS.SEASONALITY,
  PANEL_IDS.POLYGON,
  PANEL_IDS.BUFFER,
  PANEL_IDS.AREA,
  PANEL_IDS.OOPT,
  PANEL_IDS.REGIONS,
  PANEL_IDS.OOPT_FEATURE,
  PANEL_IDS.SUBMIT,
  PANEL_IDS.DATA_SOURCES,
  PANEL_IDS.EXTERNAL_PROCESSING,
  PANEL_IDS.DATA_WORK,
  PANEL_IDS.SEARCH,
  PANEL_IDS.REDBOOK,
  PANEL_IDS.TEMP_ARCHIVE,
  PANEL_IDS.COMPARE,
  PANEL_IDS.REPORT,
  PANEL_IDS.ANALYSIS,
  PANEL_IDS.COMPARE_DIVERSITY,
  PANEL_IDS.COMPARE_SIMILARITY,
  PANEL_IDS.COMPARE_DISTRIBUTION,
  PANEL_IDS.COMPARE_STATS,
  PANEL_IDS.REGION_SPECIES
];

/** Панель считается развёрнутой, если в состоянии она не помечена свёрнутой. */
export function isPanelExpandedInState(collapsedState, panelId) {
  return collapsedState[panelId] !== true;
}
