import { collapseOtherPanels, DOCKED_TOOL_PANEL_IDS, isPanelExpanded } from "../app/panelLayout";
import { PANEL_IDS } from "../app/panelConstants";

describe("collapseOtherPanels", () => {
  test("оставляет развёрнутой только запрошенную панель", () => {
    const next = collapseOtherPanels({ [PANEL_IDS.COMPARE]: false, [PANEL_IDS.REPORT]: false }, PANEL_IDS.REPORT);

    expect(next[PANEL_IDS.REPORT]).toBe(false);
    expect(next[PANEL_IDS.COMPARE]).toBe(true);
    expect(next[PANEL_IDS.YEAR]).toBe(true);
  });

  test("док-инструменты не сворачиваются", () => {
    const next = collapseOtherPanels({ [PANEL_IDS.AREAL]: false }, PANEL_IDS.FEATURE);

    expect(next[PANEL_IDS.FEATURE]).toBe(false);
    // Док-инструмент сохраняет своё состояние (остаётся развёрнутым).
    expect(next[PANEL_IDS.AREAL]).toBe(false);
    expect(next[PANEL_IDS.BUFFER]).toBeUndefined();
    expect(next[PANEL_IDS.POLYGON]).toBeUndefined();
  });

  test("не мутирует исходное состояние", () => {
    const state = { [PANEL_IDS.COMPARE]: false };
    collapseOtherPanels(state, PANEL_IDS.REPORT);

    expect(state).toEqual({ [PANEL_IDS.COMPARE]: false });
  });

  test("возвращает тот же объект, когда менять нечего", () => {
    const state = { [PANEL_IDS.REPORT]: false };
    Object.values(PANEL_IDS)
      .filter((panelId) => panelId !== PANEL_IDS.REPORT && !DOCKED_TOOL_PANEL_IDS.includes(panelId))
      .forEach((panelId) => {
        state[panelId] = true;
      });

    expect(collapseOtherPanels(state, PANEL_IDS.REPORT)).toBe(state);
  });

  test("алиас GBIF/DATA_SOURCES не ломает правило", () => {
    const next = collapseOtherPanels({ [PANEL_IDS.COMPARE]: false }, PANEL_IDS.DATA_SOURCES);

    expect(next[PANEL_IDS.DATA_SOURCES]).toBe(false);
    expect(next[PANEL_IDS.COMPARE]).toBe(true);
  });

  test("разворот док-инструмента не сворачивает «Сведения о точке»", () => {
    const next = collapseOtherPanels({ [PANEL_IDS.FEATURE]: false }, PANEL_IDS.AREAL);

    expect(next[PANEL_IDS.AREAL]).toBe(false);
    expect(next[PANEL_IDS.FEATURE]).toBe(false);
  });
});

describe("isPanelExpanded", () => {
  test("свёрнутая панель не считается развёрнутой", () => {
    expect(isPanelExpanded({ [PANEL_IDS.MAP]: true }, {}, PANEL_IDS.MAP)).toBe(false);
  });

  test("панель в таскбаре не считается развёрнутой", () => {
    expect(isPanelExpanded({}, { [PANEL_IDS.MAP]: true }, PANEL_IDS.MAP)).toBe(false);
  });

  test("панель без записи в состоянии считается развёрнутой", () => {
    expect(isPanelExpanded({}, {}, PANEL_IDS.MAP)).toBe(true);
  });
});
