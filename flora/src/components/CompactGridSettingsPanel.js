import React from "react";
import {
  COMPACT_GRID_CELLS_MAX,
  COMPACT_GRID_CELLS_OPTIONS,
  COMPACT_GRID_POINT_LIMIT_MAX,
  COMPACT_GRID_POINT_LIMIT_MIN
} from "../map/compactGridSettings";
import { TEMP_LAYER_MARKER_PALETTE } from "../tempLayers/tempLayerPalette";
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

        <label className="compact-grid-settings-field">
          <span className="compact-grid-settings-label">
            Лимит точек в слоях
            <span className="compact-grid-settings-hint">
              {settings.pointLimit.toLocaleString("ru-RU")}
            </span>
          </span>
          <input
            type="range"
            min={COMPACT_GRID_POINT_LIMIT_MIN}
            max={COMPACT_GRID_POINT_LIMIT_MAX}
            step={5000}
            value={settings.pointLimit}
            onChange={(event) => patch({ pointLimit: Number(event.target.value) })}
          />
        </label>

        <label className="compact-grid-settings-field">
          <span className="compact-grid-settings-label">
            Размер квадратов
            <span className="compact-grid-settings-hint">
              {cellSizeLabel(settings.cellsPerTile)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={COMPACT_GRID_CELLS_OPTIONS.length - 1}
            step={1}
            value={cellsIndex}
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
        </label>

        <label className="compact-grid-settings-switch">
          <input
            type="checkbox"
            checked={settings.useLayerColor}
            onChange={(event) => patch({ useLayerColor: event.target.checked })}
          />
          <span>Цвет временного слоя</span>
        </label>
        <p className="compact-grid-settings-hint-block">
          Если слой без своего цвета, используется выбранный ниже.
        </p>

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
