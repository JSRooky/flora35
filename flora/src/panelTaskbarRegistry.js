/** Идентификаторы панелей для minimize → taskbar (совпадают с PANEL_IDS + правые списки). */
export const TASKBAR_PANEL_IDS = {
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
  GBIF: "gbif",
  GBIF_PROCESSING: "gbif-processing",
  DATA_SOURCES: "data-sources",
  EXTERNAL_PROCESSING: "external-processing",
  DATA_WORK: "data-work",
  SEARCH: "search",
  REDBOOK: "redbook",
  TEMP_ARCHIVE: "temp-archive",
  COMPARE: "compare",
  COMPARE_DIVERSITY: "compare-diversity",
  COMPARE_SIMILARITY: "compare-similarity",
  COMPARE_DISTRIBUTION: "compare-distribution",
  COMPARE_STATS: "compare-stats",
  OOPT_SPECIES: "oopt-species",
  DENSE_SPECIES: "dense-species",
  REGION_SPECIES: "region-species"
};

/** Подписи и ключи иконок для панели задач. */
export const PANEL_TASKBAR_META = {
  [TASKBAR_PANEL_IDS.FEATURE]: { title: "О точке", icon: "point" },
  [TASKBAR_PANEL_IDS.AREAL]: { title: "Радиус", icon: "radius" },
  [TASKBAR_PANEL_IDS.STATUS]: { title: "Статус", icon: "status" },
  [TASKBAR_PANEL_IDS.REGNUM]: { title: "Царство", icon: "clusters" },
  [TASKBAR_PANEL_IDS.MAP]: { title: "Группы точек", icon: "clusters" },
  [TASKBAR_PANEL_IDS.DENSE]: { title: "Обработка плотных групп", icon: "dense" },
  [TASKBAR_PANEL_IDS.YEAR]: { title: "Год находки", icon: "year" },
  [TASKBAR_PANEL_IDS.SEASONALITY]: { title: "Сезонность", icon: "year" },
  [TASKBAR_PANEL_IDS.POLYGON]: { title: "Полигон", icon: "polygon" },
  [TASKBAR_PANEL_IDS.BUFFER]: { title: "Буфер", icon: "buffer" },
  [TASKBAR_PANEL_IDS.AREA]: { title: "Область", icon: "area" },
  [TASKBAR_PANEL_IDS.OOPT]: { title: "ООПТ", icon: "oopt" },
  [TASKBAR_PANEL_IDS.REGIONS]: { title: "Регионы", icon: "polygon" },
  [TASKBAR_PANEL_IDS.OOPT_FEATURE]: { title: "Сведения об ООПТ", icon: "ooptFeature" },
  [TASKBAR_PANEL_IDS.SUBMIT]: { title: "Новая находка", icon: "submit" },
  [TASKBAR_PANEL_IDS.GBIF]: { title: "Источники данных", icon: "gbif" },
  [TASKBAR_PANEL_IDS.GBIF_PROCESSING]: {
    title: "Обработка внешних данных",
    icon: "gbifProcessing"
  },
  [TASKBAR_PANEL_IDS.DATA_SOURCES]: { title: "Источники данных", icon: "gbif" },
  [TASKBAR_PANEL_IDS.EXTERNAL_PROCESSING]: {
    title: "Обработка внешних данных",
    icon: "gbifProcessing"
  },
  [TASKBAR_PANEL_IDS.DATA_WORK]: { title: "Работа с данными", icon: "dataWork" },
  [TASKBAR_PANEL_IDS.SEARCH]: { title: "Поиск", icon: "speciesList" },
  [TASKBAR_PANEL_IDS.REDBOOK]: { title: "Поиск редких видов", icon: "status" },
  [TASKBAR_PANEL_IDS.TEMP_ARCHIVE]: { title: "Архив слоёв", icon: "layersArchive" },
  [TASKBAR_PANEL_IDS.COMPARE]: { title: "Сравнение", icon: "layers" },
  [TASKBAR_PANEL_IDS.COMPARE_DIVERSITY]: { title: "Разнообразие", icon: "speciesList" },
  [TASKBAR_PANEL_IDS.COMPARE_SIMILARITY]: { title: "Сходство", icon: "speciesList" },
  [TASKBAR_PANEL_IDS.COMPARE_DISTRIBUTION]: { title: "Распределение", icon: "year" },
  [TASKBAR_PANEL_IDS.COMPARE_STATS]: { title: "Статистика", icon: "speciesList" },
  [TASKBAR_PANEL_IDS.OOPT_SPECIES]: { title: "Виды внутри выбранной ООПТ", icon: "speciesList" },
  [TASKBAR_PANEL_IDS.DENSE_SPECIES]: { title: "Виды в плотной группе", icon: "speciesList" },
  [TASKBAR_PANEL_IDS.REGION_SPECIES]: { title: "Список видов региона", icon: "speciesList" }
};

/**
 * Модуль меню для восстановления панели из taskbar.
 * null — особый случай (Dense / GBIF / списки видов), обрабатывается в App.
 */
export const PANEL_TASKBAR_MODULE_ID = {
  [TASKBAR_PANEL_IDS.FEATURE]: "feature",
  [TASKBAR_PANEL_IDS.AREAL]: "areal",
  [TASKBAR_PANEL_IDS.STATUS]: "status",
  [TASKBAR_PANEL_IDS.REGNUM]: "regnum",
  [TASKBAR_PANEL_IDS.MAP]: "map",
  [TASKBAR_PANEL_IDS.YEAR]: "year",
  [TASKBAR_PANEL_IDS.SEASONALITY]: "seasonality",
  [TASKBAR_PANEL_IDS.POLYGON]: "polygon",
  [TASKBAR_PANEL_IDS.BUFFER]: "buffer",
  [TASKBAR_PANEL_IDS.AREA]: "area",
  [TASKBAR_PANEL_IDS.OOPT]: "oopt",
  [TASKBAR_PANEL_IDS.REGIONS]: "regions",
  [TASKBAR_PANEL_IDS.OOPT_FEATURE]: "oopt",
  [TASKBAR_PANEL_IDS.SUBMIT]: "submit",
  [TASKBAR_PANEL_IDS.DENSE]: null,
  [TASKBAR_PANEL_IDS.GBIF]: null,
  [TASKBAR_PANEL_IDS.GBIF_PROCESSING]: null,
  [TASKBAR_PANEL_IDS.DATA_SOURCES]: null,
  [TASKBAR_PANEL_IDS.EXTERNAL_PROCESSING]: null,
  [TASKBAR_PANEL_IDS.DATA_WORK]: "data-work",
  [TASKBAR_PANEL_IDS.SEARCH]: "search",
  [TASKBAR_PANEL_IDS.REDBOOK]: "redbook",
  [TASKBAR_PANEL_IDS.TEMP_ARCHIVE]: null,
  [TASKBAR_PANEL_IDS.COMPARE]: null,
  [TASKBAR_PANEL_IDS.COMPARE_DIVERSITY]: null,
  [TASKBAR_PANEL_IDS.COMPARE_SIMILARITY]: null,
  [TASKBAR_PANEL_IDS.COMPARE_DISTRIBUTION]: null,
  [TASKBAR_PANEL_IDS.COMPARE_STATS]: null,
  [TASKBAR_PANEL_IDS.OOPT_SPECIES]: null,
  [TASKBAR_PANEL_IDS.DENSE_SPECIES]: null,
  [TASKBAR_PANEL_IDS.REGION_SPECIES]: null
};

export function getPanelTaskbarMeta(panelId) {
  return (
    PANEL_TASKBAR_META[panelId] ?? {
      title: panelId,
      icon: "point"
    }
  );
}
