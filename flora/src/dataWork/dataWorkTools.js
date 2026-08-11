/**
 * Инструменты модуля «Работа с данными».
 * Список в хаб-панели; каждый пункт открывает своё окно.
 */

export const DATA_WORK_TOOL_IDS = {
  NEAR_SPECIES_MATCHES: "near-species-matches"
};

export const DATA_WORK_TOOLS = [
  {
    id: DATA_WORK_TOOL_IDS.NEAR_SPECIES_MATCHES,
    title: "Близкие точки",
    description:
      "Пары GBIF ↔ iNaturalist с одинаковым латинским названием в заданном радиусе."
  }
];
