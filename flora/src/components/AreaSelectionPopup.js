import React, { useState } from "react";
import { getArealPointKey } from "./addArealLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/AreaSelectionPopup.css";

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

function getCollapsedSummary(drawingMode, hasArea, containedPoints) {
  if (drawingMode) {
    return "Рисование области";
  }

  if (!hasArea) {
    return "Область не выделена";
  }

  if (containedPoints?.count > 0) {
    return `В области: ${formatContainedPointsCount(containedPoints.count)}`;
  }

  return "В области нет точек";
}

/**
 * Панель модуля «Область»: рисование произвольного контура на карте и список
 * точек, попавших внутрь выделения.
 */
export default function AreaSelectionPopup({
  drawingMode = false,
  hasArea = false,
  containedPoints = null,
  onDrawingModeChange,
  onPointSelect,
  onReset,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const hasContainedPoints = containedPoints?.count > 0;
  const drawToggleLabel = drawingMode ? "Режим рисования" : "Рисовать";

  return (
    <div className={`area-selection-popup ${collapsed ? "area-selection-popup--collapsed" : ""}`}>
      <div className="area-selection-popup-header">
        <h3 className="area-selection-popup-title">Область</h3>
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

      <div className="area-selection-popup-body">
        {collapsed ? (
          <p className="popup-collapsed-summary">
            {getCollapsedSummary(drawingMode, hasArea, containedPoints)}
          </p>
        ) : (
          <div className="area-selection-popup-content">
            {drawingMode ? (
              <p className="area-selection-popup-status area-selection-popup-status--drawing">
                Зажмите левую кнопку мыши и обведите область на карте.
              </p>
            ) : (
              <p className="area-selection-popup-status">
                Нажмите «Рисовать» и обведите на карте область, чтобы увидеть попавшие в неё точки.
              </p>
            )}

            <div className="area-selection-actions">
              <button
                type="button"
                className={`area-selection-draw-btn${drawingMode ? " area-selection-draw-btn--active" : ""}`}
                onClick={onDrawingModeChange}
                aria-pressed={drawingMode}
                title={drawToggleLabel}
              >
                Рисовать
              </button>
              <button
                type="button"
                className="area-selection-reset-btn"
                onClick={onReset}
                disabled={!hasArea && !drawingMode}
              >
                Сброс
              </button>
            </div>

            {hasArea && (
              <div className="area-selection-contained-points">
                <p className="area-selection-contained-points-title">
                  В области:{" "}
                  <strong>{formatContainedPointsCount(containedPoints?.count ?? 0)}</strong>
                </p>

                {hasContainedPoints ? (
                  <ul className="area-selection-contained-points-list">
                    {containedPoints.points.map((feature) => (
                      <li key={getArealPointKey(feature)}>
                        <button
                          type="button"
                          className="area-selection-contained-points-item"
                          onClick={() => onPointSelect?.(feature)}
                        >
                          {getPointLabel(feature, containedPoints.points)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="area-selection-popup-status">Ни одна точка не попала в выделение.</p>
                )}
              </div>
            )}
          </div>
        )}
        <ModuleHelpPanel sectionId={MODULE_IDS.AREA} open={helpOpen} />
      </div>
    </div>
  );
}
