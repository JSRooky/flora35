import React, { useState } from "react";
import { AREA_DRAW_MODES, AREA_OPERATION_MODES } from "./addAreaSelectionLayer";
import { formatPointCount, formatSpeciesCount } from "./featurePropertyLabels";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { ReactComponent as DrawFreeIcon } from "../images/draw-free.svg";
import { ReactComponent as DrawRectIcon } from "../images/draw-rect.svg";
import { ReactComponent as DrawPolyIcon } from "../images/draw-poly.svg";
import "../styles/AreaSelectionPopup.css";

const DRAW_TOOL_OPTIONS = [
  { id: AREA_DRAW_MODES.FREEHAND, label: "Произвольная", Icon: DrawFreeIcon },
  { id: AREA_DRAW_MODES.RECTANGLE, label: "Прямоугольник", Icon: DrawRectIcon },
  { id: AREA_DRAW_MODES.POLYGON, label: "Полигон", Icon: DrawPolyIcon }
];

const OPERATION_TOOL_OPTIONS = [
  { id: AREA_OPERATION_MODES.ADD, label: "Добавить область", symbol: "+" },
  { id: AREA_OPERATION_MODES.SUBTRACT, label: "Вычесть область", symbol: "−" }
];

const OPERATION_MODE_LABELS = {
  [AREA_OPERATION_MODES.ADD]: "добавление",
  [AREA_OPERATION_MODES.SUBTRACT]: "вычитание"
};

const DRAW_TOOL_LABELS = {
  [AREA_DRAW_MODES.FREEHAND]: "произвольная",
  [AREA_DRAW_MODES.RECTANGLE]: "прямоугольник",
  [AREA_DRAW_MODES.POLYGON]: "полигон"
};

// Добавляем латинское название, если русское имя вида повторяется в списке.
function getSpeciesLabel(species, speciesList) {
  const nameRu = species.nameRu || "Без названия";
  const hasDuplicateName =
    speciesList.filter((item) => item.nameRu === species.nameRu).length > 1;

  if (hasDuplicateName && species.nameLatin) {
    return `${nameRu} (${species.nameLatin})`;
  }

  return nameRu;
}

function getSpeciesKey(species) {
  return species.nameLatin || species.nameRu || species.point?.id || "species";
}

// Текст подсказки зависит от активного инструмента рисования и режима сложения/вычитания области.
function getStatusText(drawTool, operationMode, drawingActive, hasArea) {
  if (drawingActive) {
    const operationHint =
      operationMode === AREA_OPERATION_MODES.SUBTRACT
        ? "Новая область будет вычтена из текущей."
        : hasArea
          ? "Новая область объединится с текущей."
          : "Будет создана новая область.";

    if (drawTool === AREA_DRAW_MODES.RECTANGLE) {
      return `Потяните мышью по карте, чтобы задать прямоугольник. ${operationHint} Повторное нажатие кнопки — отмена.`;
    }

    if (drawTool === AREA_DRAW_MODES.POLYGON) {
      return `Щёлкайте по карте для вершин. ${operationHint} Двойной левый клик или правая кнопка мыши — завершить, Esc — отмена.`;
    }

    return `Зажмите левую кнопку мыши и обведите область на карте. ${operationHint} Повторное нажатие кнопки — отмена.`;
  }

  if (operationMode === AREA_OPERATION_MODES.SUBTRACT) {
    return hasArea
      ? "Режим «−»: нарисованная область вычитается из текущей."
      : "Режим «−» доступен после создания первой области.";
  }

  return hasArea
    ? "Режим «+»: новая область объединится с текущей."
    : "Нажмите иконку инструмента и нарисуйте область на карте.";
}

function getCollapsedSummary(drawTool, operationMode, drawingActive, hasArea, containedPoints) {
  if (drawingActive) {
    return `Рисование (${OPERATION_MODE_LABELS[operationMode] ?? "область"}): ${
      DRAW_TOOL_LABELS[drawTool] ?? "область"
    }`;
  }

  if (!hasArea) {
    return "Область не выделена";
  }

  const pointsCount = containedPoints?.count ?? 0;
  const speciesCount = containedPoints?.speciesCount ?? 0;

  if (pointsCount > 0) {
    return `В области: ${formatPointCount(pointsCount)}, ${formatSpeciesCount(speciesCount)}`;
  }

  return "В области нет точек";
}

/**
 * Панель модуля «Область»: рисование контура на карте и список видов внутри выделения.
 */
export default function AreaSelectionPopup({
  drawTool = AREA_DRAW_MODES.FREEHAND,
  operationMode = AREA_OPERATION_MODES.ADD,
  onDrawToolChange,
  onOperationModeChange,
  drawingActive = false,
  hasArea = false,
  containedPoints = null,
  onPointSelect,
  onReset,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const speciesList = containedPoints?.species ?? [];
  const hasContainedSpecies = speciesList.length > 0;

  return (
    <div className={`area-selection-popup ${collapsed ? "area-selection-popup--collapsed" : ""}`}>
      <div className="area-selection-popup-header">
        <h3 className="area-selection-popup-title">Область</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton mapToolAccent open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
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
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
      </div>

      <div className="area-selection-popup-body">
        {collapsed ? (
          <p className="popup-collapsed-summary">
            {getCollapsedSummary(drawTool, operationMode, drawingActive, hasArea, containedPoints)}
          </p>
        ) : (
          <div className="area-selection-popup-content">
            <div className="area-selection-tool-row">
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
                      <Icon className="area-selection-tool-icon-svg" aria-hidden="true" focusable="false" />
                    </button>
                  );
                })}
              </div>

              <div
                className="area-selection-tool-group area-selection-tool-group--operations"
                role="group"
                aria-label="Операция с областью"
              >
                {OPERATION_TOOL_OPTIONS.map(({ id, label, symbol }) => {
                  const isActive = drawingActive && operationMode === id;
                  const isDisabled = id === AREA_OPERATION_MODES.SUBTRACT && !hasArea;

                  return (
                    <button
                      key={id}
                      type="button"
                      className={`area-selection-tool-btn area-selection-tool-btn--symbol${
                        isActive ? " area-selection-tool-btn--drawing" : ""
                      }`}
                      onClick={() => onOperationModeChange?.(id)}
                      aria-pressed={operationMode === id}
                      aria-label={label}
                      title={label}
                      disabled={isDisabled}
                    >
                      {symbol}
                    </button>
                  );
                })}
              </div>
            </div>

            <p
              className={`area-selection-popup-status${drawingActive ? " area-selection-popup-status--drawing" : ""}`}
            >
              {getStatusText(drawTool, operationMode, drawingActive, hasArea)}
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

            {hasArea ? (
              <div className="area-selection-contained-points">
                <p className="area-selection-contained-points-title">
                  В области:{" "}
                  <strong>{formatPointCount(containedPoints?.count ?? 0)}</strong>
                  {", "}
                  <strong>{formatSpeciesCount(containedPoints?.speciesCount ?? 0)}</strong>
                </p>

                {hasContainedSpecies ? (
                  <ul className="area-selection-contained-points-list">
                    {speciesList.map((species) => (
                      <li key={getSpeciesKey(species)}>
                        <button
                          type="button"
                          className="area-selection-contained-points-item"
                          onClick={() => onPointSelect?.(species.point)}
                        >
                          <span>{getSpeciesLabel(species, speciesList)}</span>
                          {species.count > 1 ? (
                            <span className="area-selection-contained-points-count">
                              — {species.count}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="area-selection-popup-status">Ни одна точка не попала в выделение.</p>
                )}
              </div>
            ) : null}
          </div>
        )}
        <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.AREA} open={helpOpen} />
      </div>
    </div>
  );
}
