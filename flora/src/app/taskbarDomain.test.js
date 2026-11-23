import { renderHook, act } from "@testing-library/react";
import { useTaskbarDomain } from "./taskbarDomain";
import { PANEL_IDS } from "./panelConstants";

function makeDeps(overrides = {}) {
  return {
    activeModule: null,
    analysisPanelOpen: false,
    arealDockedWithFeature: false,
    boundsSpeciesListOpen: false,
    bufferDockedWithFeature: false,
    compareDistributionOpen: false,
    compareDiversityOpen: false,
    comparePanelOpen: false,
    compareSimilarityOpen: false,
    compareStatsKind: null,
    dataSourceMode: "none",
    dataSourcesPanelOpen: false,
    densePileSpeciesListOpen: false,
    denseProcessingActive: false,
    expandPanel: jest.fn(),
    externalProcessingActive: false,
    isPanelOpen: () => false,
    minimizePanel: jest.fn(),
    ooptPointsFilterActive: false,
    panelCollapsed: {},
    panelMinimized: {},
    panelTaskbarOrder: [],
    pinPanelsToTaskbar: jest.fn(),
    polygonDockedWithFeature: false,
    regionSpeciesPanelOpen: false,
    reportPanelOpen: false,
    restorePanel: jest.fn(),
    selectedBoundsFeature: null,
    tempArchivePanelOpen: false,
    ...overrides
  };
}

describe("useTaskbarDomain", () => {
  test("док содержит открытую панель, даже если она убрана в док", () => {
    const { result } = renderHook(() =>
      useTaskbarDomain(
        makeDeps({
          comparePanelOpen: true,
          panelMinimized: { [PANEL_IDS.COMPARE]: true }
        })
      )
    );

    expect(result.current.activeTaskbarPanelIds).toContain(PANEL_IDS.COMPARE);
  });

  test("развёрнутая панель помечается активной, свёрнутая — нет", () => {
    const expanded = renderHook(() =>
      useTaskbarDomain(makeDeps({ comparePanelOpen: true }))
    );
    expect(expanded.result.current.expandedTaskbarPanelIds).toEqual([PANEL_IDS.COMPARE]);

    const collapsed = renderHook(() =>
      useTaskbarDomain(
        makeDeps({
          comparePanelOpen: true,
          panelCollapsed: { [PANEL_IDS.COMPARE]: true }
        })
      )
    );
    expect(collapsed.result.current.expandedTaskbarPanelIds).toEqual([]);
  });

  test("клик по свёрнутой панели разворачивает её", () => {
    const deps = makeDeps({
      comparePanelOpen: true,
      panelCollapsed: { [PANEL_IDS.COMPARE]: true }
    });
    const { result } = renderHook(() => useTaskbarDomain(deps));

    act(() => result.current.handleTaskbarPanelClick(PANEL_IDS.COMPARE));

    expect(deps.expandPanel).toHaveBeenCalledWith(PANEL_IDS.COMPARE);
    expect(deps.minimizePanel).not.toHaveBeenCalled();
  });

  test("клик по развёрнутой панели убирает её в док", () => {
    const deps = makeDeps({ comparePanelOpen: true });
    const { result } = renderHook(() => useTaskbarDomain(deps));

    act(() => result.current.handleTaskbarPanelClick(PANEL_IDS.COMPARE));

    expect(deps.minimizePanel).toHaveBeenCalledWith(PANEL_IDS.COMPARE);
  });

  test("клик по панели в доке возвращает её в стек", () => {
    const deps = makeDeps({
      comparePanelOpen: true,
      panelMinimized: { [PANEL_IDS.COMPARE]: true }
    });
    const { result } = renderHook(() => useTaskbarDomain(deps));

    act(() => result.current.handleTaskbarPanelClick(PANEL_IDS.COMPARE));

    expect(deps.restorePanel).toHaveBeenCalledWith(PANEL_IDS.COMPARE);
  });

  test("клик по закрытой панели открывает её", () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useTaskbarDomain(deps));

    act(() => result.current.handleTaskbarPanelClick(PANEL_IDS.COMPARE));

    expect(deps.restorePanel).toHaveBeenCalledWith(PANEL_IDS.COMPARE);
  });
});
