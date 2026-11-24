import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ExternalProcessingPanel from "./ExternalProcessingPanel";
import { createDefaultExternalProcessingFilters } from "../externalSources/externalProcessingFilters";

jest.mock("./ModuleHelp", () => ({
  ModuleHelpButton: () => null,
  ModuleHelpPanel: () => null
}));

describe("ExternalProcessingPanel", () => {
  test("changes the source and kingdom filters", () => {
    const filters = createDefaultExternalProcessingFilters();
    const onFiltersChange = jest.fn();
    render(
      <ExternalProcessingPanel
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Источник"), {
      target: { value: "gbif" }
    });
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...filters,
      sourceMode: "gbif"
    });

    fireEvent.change(screen.getByLabelText("Царство"), {
      target: { value: "plantae" }
    });
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...filters,
      kingdomId: "plantae"
    });
  });
});
