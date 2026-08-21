/** Идентификаторы источников точек для отчёта. */
export const REPORT_SOURCES = {
  VISIBLE_FILTERED: "visible_filtered",
  SPATIAL_TOOL: "spatial_tool",
  TOOL_FILTER_ONLY: "tool_filter_only",
  SELECTED_POINT: "selected_point",
  BUFFER_MULTI_SELECT: "buffer_multi_select"
};

export const REPORT_SOURCE_OPTIONS = [
  {
    id: REPORT_SOURCES.VISIBLE_FILTERED,
    label: "Видимые на карте",
    description: "Все точки с учётом текущих фильтров и источника данных."
  },
  {
    id: REPORT_SOURCES.SPATIAL_TOOL,
    label: "Активный инструмент карты",
    description: "Точки внутри области, радиуса, буфера, полигона или пересечения ареалов."
  },
  {
    id: REPORT_SOURCES.TOOL_FILTER_ONLY,
    label: "Только «Только эти»",
    description: "Точки, отфильтрованные переключателем «Только эти» активного инструмента."
  },
  {
    id: REPORT_SOURCES.SELECTED_POINT,
    label: "Выбранная точка",
    description: "Одна точка, выбранная кликом по маркеру."
  },
  {
    id: REPORT_SOURCES.BUFFER_MULTI_SELECT,
    label: "Мультивыбор буфера",
    description: "Точки, явно выбранные в режиме мультивыбора инструмента «Буфер»."
  }
];

export const REPORT_FORMATS = {
  CSV: "csv",
  JSON: "json",
  GEOJSON: "geojson"
};

export const REPORT_FORMAT_OPTIONS = [
  { id: REPORT_FORMATS.CSV, label: "CSV (Excel)" },
  { id: REPORT_FORMATS.JSON, label: "JSON" },
  { id: REPORT_FORMATS.GEOJSON, label: "GeoJSON" }
];

/** Человекочитаемая подпись источника для meta.sourceLabel. */
export function getReportSourceLabel(sourceId) {
  return REPORT_SOURCE_OPTIONS.find((option) => option.id === sourceId)?.label ?? sourceId;
}
