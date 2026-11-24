import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SettingsPanel from "./SettingsPanel";

describe("SettingsPanel", () => {
  test("duplicates shared display settings and keeps tooltip preference independent", () => {
    const onPerformanceModeChange = jest.fn();
    const onHoverTooltipsDisabledChange = jest.fn();
    render(
      <SettingsPanel
        mapDisplayProps={{
          lowPerformanceMode: true,
          onPerformanceModeChange
        }}
        hoverTooltipsDisabled={false}
        onHoverTooltipsDisabledChange={onHoverTooltipsDisabledChange}
        collapsed={false}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Режим слабых ПК" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Подсказки при наведении" })).toBeChecked();
    expect(
      screen.getByText(/Подсказки временно отключены режимом слабых ПК/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Режим слабых ПК" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Подсказки при наведении" }));

    expect(onPerformanceModeChange).toHaveBeenCalledWith(false);
    expect(onHoverTooltipsDisabledChange).toHaveBeenCalledWith(true);
  });
});
