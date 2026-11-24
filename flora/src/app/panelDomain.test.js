import { act, renderHook } from "@testing-library/react";
jest.mock("../components/sharePointLink", () => ({
  parseSharePointParams: jest.fn(() => null)
}));
jest.mock("../map/dataWorkingSet", () => ({
  syncDataWorkingSet: jest.fn()
}));

import { usePanelDomain } from "./panelDomain";
import { PANEL_IDS } from "./panelConstants";

function makeDeps() {
  return {
    activeModule: null,
    dataSourceModeRef: { current: "none" },
    map: { current: null },
    setActiveModule: jest.fn(),
    setBoundsSpeciesListOpen: jest.fn(),
    setDataSourceModeState: jest.fn(),
    setDensePileSpeciesListOpen: jest.fn(),
    setDenseProcessingActive: jest.fn(),
    setExternalProcessingActive: jest.fn(),
    setRegionSpeciesPanelOpen: jest.fn()
  };
}

describe("usePanelDomain", () => {
  test("minimizing data sources keeps the panel open for taskbar restoration", () => {
    const { result } = renderHook(() => usePanelDomain(makeDeps()));

    act(() => {
      result.current.setDataSourcesPanelOpen(true);
      result.current.handleMinimizePanel(PANEL_IDS.DATA_SOURCES)();
    });

    expect(result.current.dataSourcesPanelOpen).toBe(true);
    expect(result.current.isPanelMinimized(PANEL_IDS.DATA_SOURCES)).toBe(true);
    expect(result.current.panelTaskbarOrder).toContain(PANEL_IDS.DATA_SOURCES);
  });
});
