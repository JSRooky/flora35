import React from "react";
import "../styles/ArealPopup.css";

const RADIUS_MIN = 0.5;
const RADIUS_MAX = 15;

function getRangeProgress(value) {
  return ((value - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100;
}

function getCollapsedSummary(enabled, allMarkers, radius) {
  if (allMarkers) {
    return `Ко всем маркерам, ${radius} км`;
  }

  if (enabled) {
    return `Ареал: ${radius} км`;
  }

  return "Ареал выключен";
}

export default function ArealPopup({
  enabled,
  allMarkers,
  radius,
  onEnabledChange,
  onAllMarkersChange,
  onRadiusChange,
  collapsed = false,
  onCollapsedChange
}) {
  const isActive = enabled || allMarkers;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <div className={`areal-popup ${collapsed ? "areal-popup--collapsed" : ""}`}>
      <div className="areal-popup-header">
        <h3 className="areal-popup-title">Ареал</h3>
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

      {collapsed ? (
        <p className="popup-collapsed-summary">
          {getCollapsedSummary(enabled, allMarkers, radius)}
        </p>
      ) : (
        <div className="areal-popup-content">
          <label className={`areal-switch ${allMarkers ? "areal-switch--disabled" : ""}`}>
            <input
            type="checkbox"
            checked={enabled}
            disabled={allMarkers}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <span className="areal-switch-slider" />
          <span className="areal-switch-label">Установить ареал</span>
        </label>

        <label className="areal-switch">
          <input
            type="checkbox"
            checked={allMarkers}
            onChange={(e) => onAllMarkersChange(e.target.checked)}
          />
          <span className="areal-switch-slider" />
          <span className="areal-switch-label">Ко всем видимым маркерам</span>
        </label>

        <div className={`areal-radius ${isActive ? "" : "areal-radius--disabled"}`}>
          <label htmlFor="areal-radius-slider">
            Радиус ареала: <strong>{radius} км</strong>
          </label>
          <input
            id="areal-radius-slider"
            type="range"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={0.1}
            value={radius}
            disabled={!isActive}
            style={{ "--range-progress": `${getRangeProgress(radius)}%` }}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
          />
        </div>
        </div>
      )}
    </div>
  );
}
