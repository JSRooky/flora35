import { MODULE_IDS } from "./components/ModuleMenu";

const STORAGE_KEY = "flora35-tool-points-filter";

/** Инструменты, для которых поддерживается переключатель «Только эти» (фильтр точек). */
export const TOOL_POINTS_FILTER_MODULES = [
  MODULE_IDS.MAP,
  MODULE_IDS.AREAL,
  MODULE_IDS.BUFFER,
  MODULE_IDS.POLYGON,
  MODULE_IDS.AREA,
  MODULE_IDS.OOPT
];

// Состояние по умолчанию — все переключатели выключены.
function createDefaultState() {
  return Object.fromEntries(TOOL_POINTS_FILTER_MODULES.map((moduleId) => [moduleId, false]));
}

/** Загружает сохранённые переключатели «Только эти» для инструментов карты. */
export function loadToolPointsFilterState() {
  if (typeof window === "undefined") {
    return createDefaultState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    const state = createDefaultState();

    TOOL_POINTS_FILTER_MODULES.forEach((moduleId) => {
      if (typeof parsed[moduleId] === "boolean") {
        state[moduleId] = parsed[moduleId];
      }
    });

    return state;
  } catch {
    return createDefaultState();
  }
}

/** Сохраняет переключатели «Только эти» для инструментов карты. */
export function saveToolPointsFilterState(state) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = createDefaultState();
  TOOL_POINTS_FILTER_MODULES.forEach((moduleId) => {
    payload[moduleId] = Boolean(state[moduleId]);
  });

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
