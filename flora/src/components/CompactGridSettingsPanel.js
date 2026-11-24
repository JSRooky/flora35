import React from "react";
import {
  COMPACT_GRID_CELLS_MAX,
  COMPACT_GRID_CELLS_OPTIONS,
  COMPACT_GRID_POINT_LIMIT_MAX,
  COMPACT_GRID_POINT_LIMIT_MIN
} from "../map/compactGridSettings";
import { TEMP_LAYER_MARKER_PALETTE } from "../tempLayers/tempLayerPalette";
import { PanelField, PanelHint, PanelSwitch } from "./panel/PanelPrimitives";
import "../styles/CompactGridSettingsPanel.css";

function cellSizeLabel(cellsPerTile) {
  if (cellsPerTile <= 8) {
    return "крупные";
  }
  if (cellsPerTile <= 16) {
    return "средние";
  }
  return "мелкие";
}

export default function CompactGridSettingsPanel({
  open = false,
  settings,
  onSettingsChange,
  onClose
}) {
  if (!open || !settings) {
    return null;
  }

  const patch = (partial) => onSettingsChange?.({ ...settings, ...partial });
  const cellsIndex = Math.max(
    0,
    COMPACT_GRID_CELLS_OPTIONS.indexOf(settings.cellsPerTile)
  );

  return (
    <div className="compact-grid-settings-overlay" onClick={onClose}>
      <div
        className="compact-grid-settings-dialog"
        role="dialog"
        aria-labelledby="compact-grid-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="compact-grid-settings-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <h3 id="compact-grid-settings-title" className="compact-grid-settings-title">
          Сетка компактной отрисовки
        </h3>
        <p className="compact-grid-settings-lead">
          Если в отображаемых слоях загружено больше лимита точек, сетка
          включается автоматически. Считается весь слой, не только кадр карты.
        </p>

        <PanelField label="Лимит точек в слоях" value={settings.pointLimit.toLocaleString("ru-RU")}>
          <input
            type="range"
            min={COMPACT_GRID_POINT_LIMIT_MIN}
            max={COMPACT_GRID_POINT_LIMIT_MAX}
            step={5000}
            value={settings.pointLimit}
            aria-label="Лимит точек в слоях"
            onChange={(event) => patch({ pointLimit: Number(event.target.value) })}
          />
        </PanelField>

        <PanelField label="Размер квадратов" value={cellSizeLabel(settings.cellsPerTile)}>
          <input
            type="range"
            min={0}
            max={COMPACT_GRID_CELLS_OPTIONS.length - 1}
            step={1}
            value={cellsIndex}
            aria-label="Размер квадратов"
            onChange={(event) =>
              patch({
                cellsPerTile:
                  COMPACT_GRID_CELLS_OPTIONS[Number(event.target.value)] ??
                  COMPACT_GRID_CELLS_MAX
              })
            }
          />
          <span className="compact-grid-settings-scale">
            <span>Крупнее</span>
            <span>Мельче</span>
          </span>
        </PanelField>

        <PanelSwitch
          label="Цвет временного слоя"
          checked={settings.useLayerColor}
          onChange={(checked) => patch({ useLayerColor: checked })}
        />
        <PanelHint>Если слой без своего цвета, используется выбранный ниже.</PanelHint>

        <div
          className={`compact-grid-settings-colors${
            settings.useLayerColor ? " compact-grid-settings-colors--muted" : ""
          }`}
        >
          <label className="compact-grid-settings-field compact-grid-settings-field--inline">
            <span className="compact-grid-settings-label">Цвет сетки</span>
            <input
              type="color"
              value={settings.color}
              disabled={settings.useLayerColor}
              onChange={(event) => patch({ color: event.target.value })}
            />
          </label>
          <div className="compact-grid-settings-swatches">
            {TEMP_LAYER_MARKER_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`compact-grid-settings-swatch${
                  settings.color === swatch ? " is-selected" : ""
                }`}
                style={{ background: swatch }}
                disabled={settings.useLayerColor}
                title={swatch}
                onClick={() => patch({ useLayerColor: false, color: swatch })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
