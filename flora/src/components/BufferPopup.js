import React, { useState } from "react";
import {
  BUFFER_ZONES,
  BUFFER_MIN_DIAMETER_KM,
  BUFFER_DIAMETER_STEP_KM
} from "./addBufferLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/BufferPopup.css";

/** Процент заполнения слайдера для CSS-переменной --range-progress. */
function getRangeProgress(value, min, max) {
  if (max <= min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

function formatDiameter(value) {
  return `${value.toFixed(1)} км`;
}

function formatSelectedPointsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}

function getCollapsedSummary(active, feature, selectedCount, diametersKm) {
  if (!feature && selectedCount === 0) {
    return "Точка не выбрана";
  }

  if (!active) {
    return "Буфер сброшен";
  }

  const pointsLabel =
    selectedCount > 1 ? `${formatSelectedPointsCount(selectedCount)}, ` : "";

  return `${pointsLabel}Буфер: ${diametersKm.map(formatDiameter).join(" / ")}`;
}

/**
 * Панель модуля «Буфер»: набор окружностей (красная/жёлтая/зелёная) вокруг выбранной
 * или нескольких точек. Кнопка «Добавить» включает режим, в котором клик по точке
 * добавляет или убирает её из выделения.
 * Диаметр каждой окружности задаётся отдельным слайдером; «Сброс» убирает буфер с карты.
 */
export default function BufferPopup({
  feature,
  active,
  diametersKm,
  selectionMode = false,
  selectedCount = 0,
  onSelectionModeChange,
  onDiameterChange,
  onReset,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## buffer в docs/moduleHelp.md
  const hasPoints = Boolean(feature) || selectedCount > 0;
  const selectionToggleLabel = selectionMode ? "Режим добавления и удаления" : "Добавить";

  return (
    <div className={`buffer-popup ${collapsed ? "buffer-popup--collapsed" : ""}`}>
      <div className="buffer-popup-header">
        <h3 className="buffer-popup-title">Буфер</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          <button
            type="button"
            className="popup-panel-toggle"
            onClick={() => onCollapsedChange?.(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
      </div>

      {collapsed ? (
        <p className="popup-collapsed-summary">
          {getCollapsedSummary(active, feature, selectedCount, diametersKm)}
        </p>
      ) : (
        <div className="buffer-popup-content">
          {!hasPoints && (
            <p className="buffer-popup-status">Выберите точку на карте или добавьте точки в выделение.</p>
          )}

          {selectionMode && (
            <p className="buffer-popup-status buffer-popup-status--selection">
              Кликните точку на карте, чтобы добавить или убрать её из выделения.
            </p>
          )}

          {selectedCount > 0 && (
            <p className="buffer-popup-status">
              В выделении: <strong>{formatSelectedPointsCount(selectedCount)}</strong>
            </p>
          )}

          {BUFFER_ZONES.map((zone, index) => {
            const minDiameter = index === 0 ? BUFFER_MIN_DIAMETER_KM : diametersKm[index - 1];
            const value = diametersKm[index];

            return (
              <div className="buffer-zone" key={zone.id}>
                <label htmlFor={`buffer-zone-${zone.id}`}>
                  {zone.label}: <strong>{formatDiameter(value)}</strong>
                </label>
                <input
                  id={`buffer-zone-${zone.id}`}
                  type="range"
                  min={minDiameter}
                  max={zone.maxDiameterKm}
                  step={BUFFER_DIAMETER_STEP_KM}
                  value={value}
                  disabled={!hasPoints}
                  style={{
                    "--range-progress": `${getRangeProgress(value, minDiameter, zone.maxDiameterKm)}%`,
                    "--range-color": zone.color
                  }}
                  onChange={(e) => onDiameterChange(index, Number(e.target.value))}
                />
                <span className="buffer-zone-max">до {zone.maxDiameterKm} км</span>
              </div>
            );
          })}

          <div className="buffer-actions">
            <button
              type="button"
              className={`buffer-selection-btn${selectionMode ? " buffer-selection-btn--active" : ""}`}
              onClick={onSelectionModeChange}
              aria-pressed={selectionMode}
              title={selectionToggleLabel}
            >
              Добавить
            </button>
            <button
              type="button"
              className="buffer-reset-btn"
              onClick={onReset}
              disabled={!hasPoints || !active}
            >
              Сброс
            </button>
          </div>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.BUFFER} open={helpOpen} />
    </div>
  );
}
