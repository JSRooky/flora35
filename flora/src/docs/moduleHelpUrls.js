/** Человекочитаемые названия разделов полной справки (ключ = sectionId). */
export const HELP_SECTION_LABELS = {
  feature: "Сведения о точке",
  areal: "Радиус",
  polygon: "Полигон",
  buffer: "Буфер",
  area: "Область",
  year: "Год находки",
  "areal-dynamics": "Динамика ареала",
  status: "Статус МСОП",
  map: "Группы точек",
  oopt: "ООПТ",
  "oopt-feature": "Сведения об ООПТ",
  submit: "Ввод данных о находке"
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

export function getModuleHelpSectionLabel(sectionId) {
  return HELP_SECTION_LABELS[sectionId] ?? sectionId;
}

export function hasModuleHelpFullSection(sectionId) {
  return HELP_SECTION_IDS.includes(sectionId);
}
