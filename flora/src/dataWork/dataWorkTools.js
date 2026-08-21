/**
 * Инструменты модуля «Работа с данными».
 * Список в хаб-панели; каждый пункт открывает своё окно.
 */

export const DATA_WORK_TOOL_IDS = {
  NEAR_SPECIES_MATCHES: "near-species-matches",
  UNATTRIBUTED_POINTS: "unattributed-points",
  UNDO_MERGED_POINTS: "undo-merged-points"
};

export const DATA_WORK_TOOLS = [
  {
    id: DATA_WORK_TOOL_IDS.NEAR_SPECIES_MATCHES,
    title: "Близкие точки",
    description:
      "Пары GBIF ↔ iNaturalist (основные и временные слои) с одинаковым латинским названием в заданном радиусе; год сравнивается, если указан у обеих точек."
  },
  {
    id: DATA_WORK_TOOL_IDS.UNATTRIBUTED_POINTS,
    title: "Без атрибуции",
    description:
      "Точки без царства, семейства, латинского названия или года находки (все видимые слои)."
  },
  {
    id: DATA_WORK_TOOL_IDS.UNDO_MERGED_POINTS,
    title: "Отменить слияние",
    description:
      "Список слитых точек: удаление объединения и возврат исходных точек GBIF и iNaturalist на карту."
  }
];
