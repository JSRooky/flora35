import {
  PERFORMANCE_MODES,
  PERFORMANCE_MODE_STORAGE_KEY,
  applyPerformanceMode,
  isLowPerformanceMode,
  loadPerformanceMode,
  normalizePerformanceMode,
  savePerformanceMode
} from "./performanceMode";

describe("performanceMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.floraPerf;
  });

  test("нормализует неизвестные значения в обычный режим", () => {
    expect(normalizePerformanceMode("low")).toBe(PERFORMANCE_MODES.LOW);
    expect(normalizePerformanceMode("auto")).toBe(PERFORMANCE_MODES.AUTO);
    expect(normalizePerformanceMode(null)).toBe(PERFORMANCE_MODES.AUTO);
    expect(normalizePerformanceMode("что-то ещё")).toBe(PERFORMANCE_MODES.AUTO);
  });

  test("без сохранённого значения возвращает обычный режим", () => {
    expect(loadPerformanceMode()).toBe(PERFORMANCE_MODES.AUTO);
  });

  test("сохраняет и читает режим", () => {
    savePerformanceMode(PERFORMANCE_MODES.LOW);

    expect(window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY)).toBe(PERFORMANCE_MODES.LOW);
    expect(loadPerformanceMode()).toBe(PERFORMANCE_MODES.LOW);
  });

  test("применяет и снимает атрибут на <html>", () => {
    applyPerformanceMode(PERFORMANCE_MODES.LOW);
    expect(document.documentElement.dataset.floraPerf).toBe("low");

    applyPerformanceMode(PERFORMANCE_MODES.AUTO);
    expect(document.documentElement.dataset.floraPerf).toBeUndefined();
  });

  test("isLowPerformanceMode согласован с нормализацией", () => {
    expect(isLowPerformanceMode(PERFORMANCE_MODES.LOW)).toBe(true);
    expect(isLowPerformanceMode(PERFORMANCE_MODES.AUTO)).toBe(false);
    expect(isLowPerformanceMode(undefined)).toBe(false);
  });
});
