import React, { useState } from "react";
import { getArealPointKey } from "./addArealLayer";
import { AREA_DRAW_MODES } from "./addAreaSelectionLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/AreaSelectionPopup.css";

const DRAW_TOOL_OPTIONS = [
  { id: AREA_DRAW_MODES.FREEHAND, label: "Произвольная", Icon: FreehandToolIcon },
  { id: AREA_DRAW_MODES.RECTANGLE, label: "Прямоугольник", Icon: RectangleToolIcon },
  { id: AREA_DRAW_MODES.POLYGON, label: "Полигон", Icon: PolygonToolIcon }
];

const DRAW_TOOL_LABELS = {
  [AREA_DRAW_MODES.FREEHAND]: "произвольная",
  [AREA_DRAW_MODES.RECTANGLE]: "прямоугольник",
  [AREA_DRAW_MODES.POLYGON]: "полигон"
};

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

function getStatusText(drawTool, drawingActive) {
  if (drawingActive) {
    if (drawTool === AREA_DRAW_MODES.RECTANGLE) {
      return "Потяните мышью по карте, чтобы задать прямоугольник. Повторное нажатие кнопки — отмена.";
    }

    if (drawTool === AREA_DRAW_MODES.POLYGON) {
      return "Щёлкайте по карте для вершин. Двойной левый клик или правая кнопка мыши — завершить, Esc — отмена.";
    }

    return "Зажмите левую кнопку мыши и обведите область на карте. Повторное нажатие кнопки — отмена.";
  }

  return "Нажмите иконку инструмента и нарисуйте область на карте.";
}

function AreaSelectionToolIcon({ children }) {
  return (
    <svg
      className="area-selection-tool-icon-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function FreehandToolIcon() {
  return (
    <AreaSelectionToolIcon>
      <path
        d="M4 17c3-6 5-8 8-10s5-1 8 1-3 6-5 8-6 4-9 3-2-2-2-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </AreaSelectionToolIcon>
  );
}

function RectangleToolIcon() {
  return (
    <AreaSelectionToolIcon>
      <rect
        x="5"
        y="7"
        width="14"
        height="12"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </AreaSelectionToolIcon>
  );
}

function PolygonToolIcon() {
  return (
    <AreaSelectionToolIcon>
      <polygon
        points="12,4 20,9 17,19 7,19 4,9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </AreaSelectionToolIcon>
  );
}

function getCollapsedSummary(drawTool, drawingActive, hasArea, containedPoints) {
  if (drawingActive) {
    return `Рисование: ${DRAW_TOOL_LABELS[drawTool] ?? "область"}`;
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
 * Панель модуля «Область»: рисование контура на карте и список точек внутри выделения.
 */
export default function AreaSelectionPopup({
  drawTool = AREA_DRAW_MODES.FREEHAND,
  onDrawToolChange,
  drawingActive = false,
  hasArea = false,
  containedPoints = null,
  onPointSelect,
  onReset,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const hasContainedPoints = containedPoints?.count > 0;

  return (
    <div className={`area-selection-popup ${collapsed ? "area-selection-popup--collapsed" : ""}`}>
      <div className="area-selection-popup-header">
        <h3 className="area-selection-popup-title">Область</h3>
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

      <div className="area-selection-popup-body">
        {collapsed ? (
          <p className="popup-collapsed-summary">
            {getCollapsedSummary(drawTool, drawingActive, hasArea, containedPoints)}
          </p>
        ) : (
          <div className="area-selection-popup-content">
            <div className="area-selection-tool-group" role="group" aria-label="Инструмент выделения">
              {DRAW_TOOL_OPTIONS.map(({ id, label, Icon }) => {
                const isDrawing = drawingActive && drawTool === id;

                return (
                  <button
                    key={id}
                    type="button"
                    className={`area-selection-tool-btn${isDrawing ? " area-selection-tool-btn--drawing" : ""}`}
                    onClick={() => onDrawToolChange?.(id)}
                    aria-pressed={isDrawing}
                    aria-label={label}
                    title={label}
                  >
                    <Icon />
                  </button>
                );
              })}
            </div>

            <p
              className={`area-selection-popup-status${drawingActive ? " area-selection-popup-status--drawing" : ""}`}
            >
              {getStatusText(drawTool, drawingActive)}
            </p>

            <div className="area-selection-actions">
              <button
                type="button"
                className="area-selection-reset-btn"
                onClick={onReset}
                disabled={!hasArea && !drawingActive}
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
        <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.AREA} open={helpOpen} />
      </div>
    </div>
  );
}
