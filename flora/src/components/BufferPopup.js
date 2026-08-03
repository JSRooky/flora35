import React, { useMemo, useState } from "react";
import {
  BUFFER_ZONES,
  BUFFER_MIN_RADIUS_KM,
  BUFFER_RADIUS_STEP_KM,
  DEFAULT_BUFFER_RADII_KM
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

function formatRadius(value) {
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

function getCollapsedSummary(enabled, feature, selectedCount, radiiKm) {
  if (!feature && selectedCount === 0) {
    return "Точка не выбрана";
  }

  if (!enabled) {
    return "Буфер выключен";
  }

  const pointsLabel =
    selectedCount > 1 ? `${formatSelectedPointsCount(selectedCount)}, ` : "";

  return `${pointsLabel}Буфер: ${radiiKm.map(formatRadius).join(" / ")}`;
}

/**
 * Панель модуля «Буфер»: набор окружностей (зелёная / серо-голубая / серая) вокруг выбранной
 * или нескольких точек. Кнопка «Добавить» включает режим, в котором клик по точке
 * добавляет или убирает её из выделения.
 * Радиус каждой окружности задаётся отдельным слайдером; переключатель включает
 * построение буфера; «Сброс» убирает его с карты и сбрасывает настройки.
 */
export default function BufferPopup({
  feature,
  enabled,
  radiiKm = DEFAULT_BUFFER_RADII_KM,
  selectionMode = false,
  selectedCount = 0,
  onEnabledChange,
  onSelectionModeChange,
  onRadiusChange,
  onReset,
  toolBlocked = false,
  toolBlockedTitle,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## buffer в docs/moduleHelp.md
  const hasPoints = Boolean(feature) || selectedCount > 0;
  const selectionToggleLabel = selectionMode ? "Режим добавления и удаления" : "Добавить";
  const buildBlocked = toolBlocked && !enabled;
  const zoneRadii = useMemo(
    () =>
      BUFFER_ZONES.map((_, index) => {
        const value = radiiKm[index];
        return typeof value === "number" && !Number.isNaN(value) ? value : BUFFER_MIN_RADIUS_KM;
      }),
    [radiiKm]
  );

  return (
    <div className={`buffer-popup ${collapsed ? "buffer-popup--collapsed" : ""}`}>
      <div className="buffer-popup-header">
        <h3 className="buffer-popup-title">Буфер</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton mapToolAccent open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
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
          {getCollapsedSummary(enabled, feature, selectedCount, zoneRadii)}
        </p>
      ) : (
        <div className="buffer-popup-content">
          {!hasPoints && (
            <p className="buffer-popup-status">Выберите точку на карте или добавьте точки в выделение.</p>
          )}

          {toolBlocked && (
            <p className="buffer-popup-status buffer-popup-status--blocked" title={toolBlockedTitle}>
              {toolBlockedTitle}
            </p>
          )}

          <label className={`buffer-switch ${!hasPoints || buildBlocked ? "buffer-switch--disabled" : ""}`}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!hasPoints || buildBlocked}
              onChange={(e) => onEnabledChange?.(e.target.checked)}
            />
            <span className="buffer-switch-slider" />
            <span className="buffer-switch-label">Построить буфер</span>
          </label>

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
            const minRadius = index === 0 ? BUFFER_MIN_RADIUS_KM : zoneRadii[index - 1];
            const value = zoneRadii[index];
            const zoneDisabled = !hasPoints || !enabled || buildBlocked;

            return (
              <div className={`buffer-zone${zoneDisabled ? " buffer-zone--disabled" : ""}`} key={zone.id}>
                <label htmlFor={`buffer-zone-${zone.id}`}>
                  {zone.label}: <strong>{formatRadius(value)}</strong>
                </label>
                <input
                  id={`buffer-zone-${zone.id}`}
                  type="range"
                  min={minRadius}
                  max={zone.maxRadiusKm}
                  step={BUFFER_RADIUS_STEP_KM}
                  value={value}
                  disabled={zoneDisabled}
                  style={{
                    "--range-progress": `${getRangeProgress(value, minRadius, zone.maxRadiusKm)}%`,
                    "--range-color": zone.color
                  }}
                  onChange={(e) => onRadiusChange?.(index, Number(e.target.value))}
                />
                <span className="buffer-zone-max">до {zone.maxRadiusKm} км</span>
              </div>
            );
          })}

          <div className="buffer-probability-legend" aria-label="Вероятность следующей находки">
            <span className="buffer-probability-legend-title">Вероятность следующей находки</span>
            <ul className="buffer-probability-legend-list">
              {BUFFER_ZONES.map((zone) => (
                <li key={zone.id} className="buffer-probability-legend-item">
                  <span
                    className="buffer-probability-legend-swatch"
                    style={{ backgroundColor: zone.color }}
                    aria-hidden="true"
                  />
                  <span className="buffer-probability-legend-label">{zone.probabilityLabel}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="buffer-actions">
            <button
              type="button"
              className={`buffer-selection-btn${selectionMode ? " buffer-selection-btn--active" : ""}`}
              onClick={onSelectionModeChange}
              aria-pressed={selectionMode}
              title={selectionToggleLabel}
              disabled={buildBlocked}
            >
              Добавить
            </button>
            <button
              type="button"
              className="buffer-reset-btn"
              onClick={onReset}
              disabled={!enabled && selectedCount === 0 && !selectionMode}
            >
              Сброс
            </button>
          </div>
        </div>
      )}
      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.BUFFER} open={helpOpen} />
    </div>
  );
}
