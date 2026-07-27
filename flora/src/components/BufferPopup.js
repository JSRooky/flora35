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

function getCollapsedSummary(active, feature, diametersKm) {
  if (!feature) {
    return "Точка не выбрана";
  }

  if (!active) {
    return "Буфер сброшен";
  }

  return `Буфер: ${diametersKm.map(formatDiameter).join(" / ")}`;
}

/**
 * Панель модуля «Буфер»: набор окружностей (красная/жёлтая/зелёная) вокруг выбранной точки.
 * Диаметр каждой окружности задаётся отдельным слайдером; буфер строится сразу для
 * выбранной точки и обновляется при перемещении слайдеров, «Сброс» убирает его с карты.
 */
export default function BufferPopup({
  feature,
  active,
  diametersKm,
  onDiameterChange,
  onReset,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## buffer в docs/moduleHelp.md

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
          {getCollapsedSummary(active, feature, diametersKm)}
        </p>
      ) : (
        <div className="buffer-popup-content">
          {!feature && <p className="buffer-popup-status">Выберите точку на карте.</p>}

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
                  disabled={!feature}
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
              className="buffer-reset-btn"
              onClick={onReset}
              disabled={!feature || !active}
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
