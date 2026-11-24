import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DataSourcesPanel from "./DataSourcesPanel";
import RegionsLoadPopup from "./RegionsLoadPopup";
import SelectiveLoadPopup from "./SelectiveLoadPopup";

jest.mock("./ModuleHelp", () => ({
  ModuleHelpButton: () => null,
  ModuleHelpPanel: () => null
}));
jest.mock("./RegionsLoadPopup", () => ({
  __esModule: true,
  default: jest.fn(() => null)
}));
jest.mock("./RegionsFilterPopup", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("./SelectiveLoadPopup", () => ({
  __esModule: true,
  default: jest.fn(() => null)
}));
jest.mock("../images/buttons", () => ({
  DownloadIcon: () => null,
  FilterIcon: () => null,
  TrashIcon: () => null
}));
jest.mock("../gbif/gbifStore", () => ({
  getGbifFeatureCount: () => 0,
  getGbifLoadedRegionIds: () => [],
  getGbifPackedBytes: () => 0
}));
jest.mock("../inaturalist/inatStore", () => ({
  getInatFeatureCount: () => 0,
  getInatLoadedRegionIds: () => [],
  getInatPackedBytes: () => 0
}));
jest.mock("../externalSources/externalSourcesLoadManager", () => ({
  getExternalSourcesLoadSnapshot: () => ({
    gbif: { loading: false, error: null },
    inat: { loading: false, error: null }
  }),
  subscribeExternalSourcesLoad: () => () => {},
  clearAllExternalDatasets: jest.fn(),
  isExternalSourcesLoadActive: () => false
}));

describe("DataSourcesPanel", () => {
  beforeEach(() => {
    RegionsLoadPopup.mockClear();
    SelectiveLoadPopup.mockClear();
  });

  test("opens the regional data loader", () => {
    const map = {};
    render(<DataSourcesPanel map={map} />);

    fireEvent.click(screen.getByRole("button", { name: "Загрузить" }));

    const props = RegionsLoadPopup.mock.calls.at(-1)[0];
    expect(props.open).toBe(true);
    expect(props.map).toBe(map);
  });

  test("opens selective loading", () => {
    const map = {};
    render(<DataSourcesPanel map={map} />);

    fireEvent.click(screen.getByRole("button", { name: "Выборочная загрузка" }));

    const props = SelectiveLoadPopup.mock.calls.at(-1)[0];
    expect(props.open).toBe(true);
    expect(props.map).toBe(map);
  });
});
