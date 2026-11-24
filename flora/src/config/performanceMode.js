/**
 * Режим работы интерфейса: обычный и «для слабых ПК».
 *
 * В режиме `low` отключается самая дорогая графика (размытие подложки,
 * анимации, переходы, тени панелей — см. styles/panelMetrics.css) и подсказки
 * при наведении на точки. Данные и логика не меняются.
 *
 * Значение хранится в localStorage; модуль не имеет побочных эффектов при импорте,
 * поэтому его можно тестировать без браузера.
 */

export const PERFORMANCE_MODES = {
  AUTO: "auto",
  LOW: "low"
};

export const PERFORMANCE_MODE_STORAGE_KEY = "flora35-performance-mode";

export const PERFORMANCE_MODE_OPTIONS = [
  {
    id: PERFORMANCE_MODES.AUTO,
    label: "Обычный",
    hint: "Размытие, анимации и подсказки при наведении включены."
  },
  {
    id: PERFORMANCE_MODES.LOW,
    label: "Для слабых ПК",
    hint: "Без размытия, анимаций и подсказок — быстрее на слабой графике."
  }
];

export function normalizePerformanceMode(mode) {
  return mode === PERFORMANCE_MODES.LOW ? PERFORMANCE_MODES.LOW : PERFORMANCE_MODES.AUTO;
}

export function loadPerformanceMode() {
  if (typeof window === "undefined" || !window.localStorage) {
    return PERFORMANCE_MODES.AUTO;
  }

  try {
    return normalizePerformanceMode(window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY));
  } catch {
    return PERFORMANCE_MODES.AUTO;
  }
}

export function savePerformanceMode(mode) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, normalizePerformanceMode(mode));
  } catch {
    // localStorage может быть недоступен — режим просто не сохранится между сессиями.
  }
}

/** Проставляет `data-flora-perf="low"` на <html>, чтобы включить CSS-правила. */
export function applyPerformanceMode(mode) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  if (!root) {
    return;
  }

  if (normalizePerformanceMode(mode) === PERFORMANCE_MODES.LOW) {
    root.dataset.floraPerf = "low";
  } else {
    delete root.dataset.floraPerf;
  }
}

export function isLowPerformanceMode(mode) {
  return normalizePerformanceMode(mode) === PERFORMANCE_MODES.LOW;
}
