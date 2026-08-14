/** Человекочитаемые названия разделов полной справки (ключ = sectionId). */
export const HELP_SECTION_LABELS = {
  feature: "О точке",
  areal: "Радиус",
  polygon: "Полигон",
  buffer: "Буфер",
  area: "Область",
  search: "Поиск",
  year: "Год находки",
  seasonality: "Сезонность",
  "areal-dynamics": "Динамика ареала",
  status: "Статус",
  regnum: "Царство",
  map: "Группы точек",
  dense: "Обработка плотных групп",
  oopt: "ООПТ",
  "oopt-feature": "Сведения об ООПТ",
  submit: "Новая находка",
  "data-sources": "Источники данных",
  "external-processing": "Обработка внешних данных",
  "data-work": "Работа с данными",
  redbook: "Красная книга",
  gbif: "Данные GBIF",
  "gbif-processing": "Обработка данных GBIF"
};

export const HELP_SECTION_IDS = Object.keys(HELP_SECTION_LABELS);

/** URL страницы подробной справки для модуля (новая вкладка). */
export function getModuleHelpPageUrl(sectionId) {
  const base = process.env.PUBLIC_URL || "";
  const params = new URLSearchParams({ section: sectionId });
  return `${base}/help/index.html?${params.toString()}`;
}

/** URL полной справки по всем модулям (новая вкладка). */
export function getFullHelpPageUrl() {
  const base = process.env.PUBLIC_URL || "";
  return `${base}/help/index.html`;
}

/** Человекочитаемое название раздела справки (или сам sectionId, если названия нет). */
export function getModuleHelpSectionLabel(sectionId) {
  return HELP_SECTION_LABELS[sectionId] ?? sectionId;
}

/** Проверяет, есть ли для модуля отдельный раздел в полной справке. */
export function hasModuleHelpFullSection(sectionId) {
  return HELP_SECTION_IDS.includes(sectionId);
}
