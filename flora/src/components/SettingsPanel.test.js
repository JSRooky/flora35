import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import MapDisplayPanel from "./MapDisplayPanel";
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

  test("hides clustering controls and lets users change or reset kingdom cluster colors", () => {
    const onClusterRegnumColorChange = jest.fn();
    const onResetClusterRegnumColors = jest.fn();
    render(
      <SettingsPanel
        mapDisplayProps={{
          clusteringEnabled: true,
          clusterByRegnum: true,
          clusterPieCharts: false
        }}
        clusterRegnumColors={{
          plantae: "#588f38",
          animalia: "#c98263",
          fungi: "#7a5d8f",
          protozoa: "#2a8f9e"
        }}
        onClusterRegnumColorChange={onClusterRegnumColorChange}
        onResetClusterRegnumColors={onResetClusterRegnumColors}
        collapsed={false}
      />
    );

    expect(screen.queryByRole("checkbox", { name: "Кластеризовать" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "По царству" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Цвет царства: Растения")).toHaveValue("#588f38");

    fireEvent.change(screen.getByLabelText("Цвет царства: Растения"), {
      target: { value: "#123456" }
    });
    expect(onClusterRegnumColorChange).toHaveBeenCalledWith("plantae", "#123456");

    fireEvent.click(screen.getByRole("button", { name: "Сбросить цвета" }));
    expect(onResetClusterRegnumColors).toHaveBeenCalledTimes(1);
  });

  test("keeps clustering controls in the groups panel", () => {
    render(<MapDisplayPanel collapsed={false} embedded />);

    expect(screen.getByRole("checkbox", { name: "Кластеризовать" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "По царству" })).toBeInTheDocument();
  });
});
