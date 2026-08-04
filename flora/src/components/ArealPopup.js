import React, { useState } from "react";
import { getArealPointKey } from "./addArealLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import ContainedPointsFilterRow from "./ContainedPointsFilterRow";
import "../styles/ArealPopup.css";
const RADIUS_MIN = 0.5;
const RADIUS_MAX = 15;
export const DEFAULT_AREAL_RADIUS_KM = 5;

/** Процент заполнения слайдера радиуса для CSS-переменной --range-progress. */
function getRangeProgress(value) {
  return ((value - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100;
}

function getCollapsedSummary(enabled, allMarkers, radius) {
  if (allMarkers) {
    return `Ко всем маркерам, ${radius} км`;
  }

  if (enabled) {
    return `Радиус: ${radius} км`;
  }

  return "Радиус выключен";
}

function formatContainedPointsCount(count) {
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

function getPointLabel(feature, points) {
  const nameRu = feature.properties?.name_ru || "Без названия";
  const hasDuplicateName = points.filter(
    (point) => point.properties?.name_ru === feature.properties?.name_ru
  ).length > 1;

  if (hasDuplicateName && feature.properties?.name_latin) {
    return `${nameRu} (${feature.properties.name_latin})`;
  }

  return nameRu;
}

/** Панель управления «зоной поиска» вокруг точки или всех видимых маркеров. */
export default function ArealPopup({
  enabled,
  allMarkers,
  radius,
  containedPoints = null,
  pointsFilterEnabled = false,
  onPointsFilterToggle,
  pointsFilterAvailable = false,
  onPointSelect,
  onEnabledChange,  onAllMarkersChange,
  onRadiusChange,
  onReset,
  toolBlocked = false,
  toolBlockedTitle,
  collapsed = false,
  onCollapsedChange
}) {
  // Радиус доступен, если включён для одной точки или для всех маркеров.
  const isActive = enabled || allMarkers;
  const hasContainedPoints = containedPoints?.count > 0;
  const canReset = isActive || radius !== DEFAULT_AREAL_RADIUS_KM;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## areal в docs/moduleHelp.md

  return (
    <div className={`areal-popup ${collapsed ? "areal-popup--collapsed" : ""}`}>
      <div className="areal-popup-header">
        <h3 className="areal-popup-title">Радиус</h3>
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
          {getCollapsedSummary(enabled, allMarkers, radius)}
        </p>
      ) : (
        <div className="areal-popup-content">
          {toolBlocked && (
            <p className="areal-popup-status areal-popup-status--blocked" title={toolBlockedTitle}>
              {toolBlockedTitle}
            </p>
          )}

          {/* Режим «одна точка» недоступен, когда включён радиус ко всем маркерам. */}
          <label className={`areal-switch ${allMarkers || toolBlocked ? "areal-switch--disabled" : ""}`}>
            <input
            type="checkbox"
            checked={enabled}
            disabled={allMarkers || toolBlocked}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <span className="areal-switch-slider" />
          <span className="areal-switch-label">Установить радиус</span>
        </label>

        <label className={`areal-switch ${toolBlocked ? "areal-switch--disabled" : ""}`}>
          <input
            type="checkbox"
            checked={allMarkers}
            disabled={toolBlocked}
            onChange={(e) => onAllMarkersChange(e.target.checked)}
          />
          <span className="areal-switch-slider" />
          <span className="areal-switch-label">Ко всем видимым маркерам</span>
        </label>

        <div className={`areal-radius ${isActive ? "" : "areal-radius--disabled"}`}>
          <label htmlFor="areal-radius-slider">
            Радиус: <strong>{radius} км</strong>
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

        {(hasContainedPoints || pointsFilterAvailable) && (
          <div className="areal-contained-points">
            <ContainedPointsFilterRow
              summary={
                <>
                  {pointsFilterEnabled ? "В выбранной ООПТ" : "В радиусе"}:{" "}
                  <strong>{formatContainedPointsCount(containedPoints?.count ?? 0)}</strong>
                </>
              }
              pointsFilterEnabled={pointsFilterEnabled}
              onPointsFilterToggle={onPointsFilterToggle}
              pointsFilterAvailable={pointsFilterAvailable}
            />

            {hasContainedPoints ? (
              <ul className="areal-contained-points-list">
                {containedPoints.points.map((feature) => (
                  <li key={getArealPointKey(feature)}>
                    <button
                      type="button"
                      className="areal-contained-points-item"
                      onClick={() => onPointSelect?.(feature)}
                    >
                      {getPointLabel(feature, containedPoints.points)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="areal-actions">
          <button
            type="button"
            className="areal-reset-btn"
            onClick={onReset}
            disabled={!canReset}
          >
            Сброс
          </button>
        </div>
        </div>
      )}
      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.AREAL} open={helpOpen} />
    </div>
  );
}
