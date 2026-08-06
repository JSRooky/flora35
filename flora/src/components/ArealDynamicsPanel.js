import React, { useState } from "react";
import { POLYGON_BUILD_MODES } from "./addSpeciesPolygonLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import PolygonModeIcon from "./PolygonModeIcon";
import "../styles/ArealDynamicsPanel.css";

function formatAreaKm2(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (value < 0.01) {
    return "< 0.01 км²";
  }

  return `${value.toFixed(value < 1 ? 2 : 1)} км²`;
}

function formatNewPointsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `+${count} находка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `+${count} находки`;
  }

  return `+${count} находок`;
}

function TrashIcon() {
  return (
    <svg
      className="areal-dynamics-reset-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points="3 6 5 6 21 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="11"
        x2="10"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="11"
        x2="14"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Панель «Динамика ареала» — надстройка над таймлайном. */
export default function ArealDynamicsPanel({
  enabled,
  onEnabledChange,
  speciesLabel,
  speciesLatin,
  slices,
  timelineYear,
  onYearSelect,
  onReset,
  hideOthers = false,
  onHideOthersChange,
  computing = false,
  buildMode = POLYGON_BUILD_MODES.CONVEX,
  onBuildModeToggle,
  canToggleAllPoints = false
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const visibleSlices = slices.filter((slice) => slice.year <= timelineYear);
  const hasSpecies = Boolean(speciesLatin);
  const isAllPointsMode = buildMode === POLYGON_BUILD_MODES.ALL_POINTS;

  return (
    <div
      className={`areal-dynamics-panel${
        enabled && hasSpecies ? " areal-dynamics-panel--has-reset" : ""
      }`}
    >
      <div className="areal-dynamics-row">
        <label className="areal-dynamics-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span className="areal-dynamics-switch-slider" />
          <span className="areal-dynamics-switch-label">Динамика ареала</span>
        </label>

        {enabled ? (
          hasSpecies ? (
            <span className="areal-dynamics-species-name">{speciesLabel}</span>
          ) : (
            <span className="areal-dynamics-hint">Выделите точку вида на карте</span>
          )
        ) : null}

        {enabled && hasSpecies ? (
          <label className="areal-dynamics-switch areal-dynamics-switch--secondary">
            <input
              type="checkbox"
              checked={hideOthers}
              onChange={(event) => onHideOthersChange(event.target.checked)}
            />
            <span className="areal-dynamics-switch-slider" />
            <span className="areal-dynamics-switch-label">Скрыть остальные</span>
          </label>
        ) : null}

        {enabled && computing ? (
          <span className="areal-dynamics-status">Вычисление…</span>
        ) : null}

        {enabled && !computing && hasSpecies && slices.length === 0 ? (
          <span className="areal-dynamics-status">Нет данных</span>
        ) : null}

        {enabled && !computing && visibleSlices.length > 0 ? (
          <ul className="areal-dynamics-legend" aria-label="Легенда по годам">
            {slices.map((slice) => {
              const isVisible = slice.year <= timelineYear;
              const areaLabel = formatAreaKm2(slice.areaKm2);

              return (
                <li key={slice.year}>
                  <button
                    type="button"
                    className={`areal-dynamics-legend-item${isVisible ? "" : " areal-dynamics-legend-item--hidden"}`}
                    onClick={() => onYearSelect(slice.year)}
                    title={`${slice.year}: ${formatNewPointsCount(slice.newPointCount)}${areaLabel ? `, ${areaLabel}` : ""}`}
                  >
                    <span
                      className="areal-dynamics-legend-swatch"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="areal-dynamics-legend-year">{slice.year}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="areal-dynamics-panel-actions">
        {enabled && hasSpecies ? (
          <button
            type="button"
            className={`areal-dynamics-mode-btn${
              isAllPointsMode ? " areal-dynamics-mode-btn--active" : ""
            }`}
            onClick={onBuildModeToggle}
            disabled={!canToggleAllPoints && !isAllPointsMode}
            aria-label={isAllPointsMode ? "Оболочка" : "Все точки"}
            title={isAllPointsMode ? "Оболочка" : "Все точки"}
          >
            <PolygonModeIcon allPoints={isAllPointsMode} className="areal-dynamics-mode-icon" />
          </button>
        ) : null}
        {enabled && hasSpecies ? (
          <button
            type="button"
            className="areal-dynamics-reset-btn"
            onClick={onReset}
            aria-label="Сбросить динамику ареала"
            title="Сбросить"
          >
            <TrashIcon />
          </button>
        ) : null}
        <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
      </div>

      <ModuleHelpPanel sectionId="areal-dynamics" open={helpOpen} />
    </div>
  );
}
