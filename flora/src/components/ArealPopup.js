import React from "react";
import "../styles/ArealPopup.css";

export default function ArealPopup({
  enabled,
  allMarkers,
  radius,
  onEnabledChange,
  onAllMarkersChange,
  onRadiusChange
}) {
  const isActive = enabled || allMarkers;

  return (
    <div className="areal-popup">
      <div className="areal-popup-content">
        <h3>Ареал</h3>

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
            min={0.5}
            max={15}
            step={0.1}
            value={radius}
            disabled={!isActive}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
