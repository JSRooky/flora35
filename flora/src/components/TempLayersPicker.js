import React, { useEffect, useRef, useState } from "react";
import {
  getTempLayers,
  TEMP_LAYER_MARKER_PALETTE
} from "../tempLayers/tempLayerStore";
import "../styles/ExternalLayersPicker.css";
import "../styles/TempLayersPicker.css";
import { ClockIcon, EyeIcon, EyeOffIcon, TrashIcon } from "../images/buttons";

const HOVER_CLOSE_DELAY_MS = 160;

function HeatmapIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 3.2c.4 2.1-.3 3.6-1.4 5-1.2 1.5-2.6 2.8-2.6 5.1 0 3.1 2.4 5.5 5.4 5.5s5.4-2.4 5.4-5.5c0-2.6-1.5-4.2-2.8-5.8-1-1.2-1.8-2.6-1.5-4.3-.9.6-1.8 1.6-2.5 2.8z"
        opacity="0.92"
      />
    </svg>
  );
}

function formatLayerMeta(layer) {
  const points = new Intl.NumberFormat("ru-RU").format(layer.features?.length ?? 0);
  const regionCount = Array.isArray(layer.regionIds) ? layer.regionIds.length : 0;
  const regionPart =
    regionCount === 1 ? "1 рег." : regionCount > 1 ? `${regionCount} рег.` : null;
  return regionPart ? `${regionPart} · ${points} т.` : `${points} т.`;
}

function layerRowStyle(layer) {
  if (!layer.markerColor) {
    return undefined;
  }
  return { "--temp-layer-color": layer.markerColor };
}

function layerTitle(layer) {
  const source = layer.source === "inat" ? "iNaturalist" : "GBIF";
  if (layer.taxonName) {
    return `${source} · ${layer.taxonName}`;
  }
  return layer.label || source;
}

function LayerColorButton({ layer, open, tabIndex, onToggle, onSelect, onReset }) {
  const current = layer.markerColor || "";

  return (
    <div className="temp-layers-picker-color">
      <button
        type="button"
        className={`temp-layers-picker-color-btn${
          current ? " temp-layers-picker-color-btn--custom" : ""
        }`}
        tabIndex={tabIndex}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={
          current
            ? `Цвет маркеров «${layer.label}»: ${current}`
            : `Цвет маркеров «${layer.label}»: по царству`
        }
        title={current ? "Цвет маркеров" : "Цвет маркеров (по царству)"}
        style={current ? { backgroundColor: current } : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      />
      {open ? (
        <div
          className="temp-layers-picker-palette"
          role="listbox"
          aria-label={`Палитра цвета для «${layer.label}»`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`temp-layers-picker-palette-swatch temp-layers-picker-palette-swatch--auto${
              !current ? " temp-layers-picker-palette-swatch--selected" : ""
            }`}
            role="option"
            aria-selected={!current}
            title="По умолчанию"
            onClick={() => onReset()}
          >
            По умолчанию
          </button>
          <div className="temp-layers-picker-palette-grid">
            {TEMP_LAYER_MARKER_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`temp-layers-picker-palette-swatch${
                  current === color ? " temp-layers-picker-palette-swatch--selected" : ""
                }`}
                role="option"
                aria-selected={current === color}
                aria-label={color}
                title={color}
                style={{ backgroundColor: color }}
                onClick={() => onSelect(color)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TempLayersPicker({
  dataRevision = 0,
  onToggleLayer,
  onDeleteLayer,
  onColorChange,
  onHeatmapChange,
  onHeatmapAllChange
}) {
  const [open, setOpen] = useState(false);
  const [colorMenuLayerId, setColorMenuLayerId] = useState(null);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  void dataRevision;
  const layers = getTempLayers();

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleOpen = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const handleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setColorMenuLayerId(null);
    }, HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (colorMenuLayerId) {
          setColorMenuLayerId(null);
          return;
        }
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, colorMenuLayerId]);

  useEffect(() => () => clearCloseTimer(), []);

  const activeCount = layers.filter((layer) => layer.visible).length;
  const heatmapCount = layers.filter((layer) => layer.heatmapEnabled).length;
  const allHeatmapsOn = layers.length > 0 && heatmapCount === layers.length;

  return (
    <div
      className="external-layers-picker temp-layers-picker"
      ref={rootRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) {
          setOpen(false);
          setColorMenuLayerId(null);
        }
      }}
    >
      <div
        className={`external-layers-picker-panel-wrap${
          open ? " external-layers-picker-panel-wrap--open" : ""
        }`}
        aria-hidden={!open}
      >
        <div
          className={`external-layers-picker-panel temp-layers-picker-panel${
            colorMenuLayerId ? " temp-layers-picker-panel--palette-open" : ""
          }`}
          role="listbox"
          aria-label="Временные слои"
          aria-multiselectable="true"
        >
          {layers.length === 0 ? (
            <p className="temp-layers-picker-empty">
              Пока нет временных слоёв. Сохраните выборку кнопкой «Во временный слой».
            </p>
          ) : (
            <>
              <div className="temp-layers-picker-toolbar">
                <button
                  type="button"
                  className={`temp-layers-picker-heatmap-all${
                    allHeatmapsOn ? " temp-layers-picker-heatmap-all--on" : ""
                  }`}
                  tabIndex={open ? 0 : -1}
                  aria-pressed={allHeatmapsOn}
                  title={
                    allHeatmapsOn
                      ? "Выключить тепловые карты всех слоёв"
                      : "Тепловая карта по всем временным слоям"
                  }
                  onClick={() => onHeatmapAllChange?.(!allHeatmapsOn)}
                >
                  <HeatmapIcon className="temp-layers-picker-heatmap-icon" />
                  <span>
                    {allHeatmapsOn
                      ? "Тепловые карты выкл."
                      : "Тепловая карта всех слоёв"}
                  </span>
                </button>
              </div>
              {layers.map((layer) => (
              <div
                key={layer.id}
                className={`temp-layers-picker-row${
                  layer.visible ? "" : " temp-layers-picker-row--hidden"
                }${
                  colorMenuLayerId === layer.id
                    ? " temp-layers-picker-row--palette-open"
                    : ""
                }`}
                style={layerRowStyle(layer)}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={layer.visible}
                  tabIndex={open ? 0 : -1}
                  className="temp-layers-picker-toggle"
                  title={layer.visible ? `Скрыть «${layer.label}»` : `Показать «${layer.label}»`}
                  onClick={() => onToggleLayer?.(layer.id, !layer.visible)}
                >
                  <span className="temp-layers-picker-option-text">
                    <span className="external-layers-picker-option-label">{layerTitle(layer)}</span>
                    <span className="temp-layers-picker-option-meta">{formatLayerMeta(layer)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`temp-layers-picker-heatmap${
                    layer.heatmapEnabled ? " temp-layers-picker-heatmap--on" : ""
                  }`}
                  tabIndex={open ? 0 : -1}
                  aria-pressed={Boolean(layer.heatmapEnabled)}
                  aria-label={
                    layer.heatmapEnabled
                      ? `Выключить тепловую карту «${layer.label}»`
                      : `Тепловая карта слоя «${layer.label}»`
                  }
                  title={
                    layer.heatmapEnabled
                      ? "Тепловая карта слоя включена"
                      : "Тепловая карта только этого слоя"
                  }
                  onClick={() => onHeatmapChange?.(layer.id, !layer.heatmapEnabled)}
                >
                  <HeatmapIcon className="temp-layers-picker-heatmap-icon" />
                </button>
                <button
                  type="button"
                  className="temp-layers-picker-delete"
                  tabIndex={open ? 0 : -1}
                  aria-label={`Удалить слой «${layer.label}»`}
                  title="Удалить"
                  onClick={() => onDeleteLayer?.(layer.id)}
                >
                  <TrashIcon className="temp-layers-picker-delete-icon" aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className={`temp-layers-picker-hide${
                    layer.visible ? "" : " temp-layers-picker-hide--off"
                  }`}
                  tabIndex={open ? 0 : -1}
                  aria-pressed={!layer.visible}
                  aria-label={
                    layer.visible ? `Скрыть «${layer.label}»` : `Показать «${layer.label}»`
                  }
                  title={layer.visible ? "Скрыть слой" : "Показать слой"}
                  onClick={() => onToggleLayer?.(layer.id, !layer.visible)}
                >
                  {layer.visible ? (
                    <EyeIcon className="temp-layers-picker-hide-icon" aria-hidden="true" focusable="false" />
                  ) : (
                    <EyeOffIcon className="temp-layers-picker-hide-icon" aria-hidden="true" focusable="false" />
                  )}
                </button>
                <LayerColorButton
                  layer={layer}
                  open={colorMenuLayerId === layer.id}
                  tabIndex={open ? 0 : -1}
                  onToggle={() =>
                    setColorMenuLayerId((current) =>
                      current === layer.id ? null : layer.id
                    )
                  }
                  onSelect={(color) => {
                    onColorChange?.(layer.id, color);
                    setColorMenuLayerId(null);
                  }}
                  onReset={() => {
                    onColorChange?.(layer.id, null);
                    setColorMenuLayerId(null);
                  }}
                />
              </div>
            ))}
            </>
          )}
        </div>
      </div>

      <div className="external-layers-picker-toggle-wrap">
        <button
          type="button"
          className={`external-layers-picker-toggle${
            open ? " external-layers-picker-toggle--open" : ""
          }`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Временные слои"
          title="Временные слои"
        >
          <ClockIcon className="external-layers-picker-icon" aria-hidden="true" focusable="false" />
          {activeCount > 0 ? (
            <span className="external-layers-picker-count">{activeCount}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
