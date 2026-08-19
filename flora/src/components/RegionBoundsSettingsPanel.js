import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createDefaultRegionBoundsSettings,
  DEFAULT_REGION_RANDOM_STYLE,
  getRegionRandomStylePreset,
  normalizeHexColor,
  REGION_RANDOM_STYLE_PRESETS
} from "./regionBoundsSettings";
import { TEMP_LAYER_MARKER_PALETTE } from "../tempLayers/tempLayerStore";
import "../styles/HeatmapSettingsPanel.css";
import "../styles/TempLayersPicker.css";
import "../styles/RegionBoundsSettingsPanel.css";

function FieldRow({ label, children }) {
  return (
    <div className="heatmap-settings-field">
      <span className="heatmap-settings-field-label">{label}</span>
      {children}
    </div>
  );
}

function RangeInput({ value, min, max, step, onChange, formatValue }) {
  const span = max - min;
  const progress = span <= 0 ? 0 : ((Number(value) - min) / span) * 100;
  return (
    <span className="heatmap-settings-range">
      <span className="heatmap-settings-range-value">
        {formatValue ? formatValue(value) : value}
      </span>
      <input
        type="range"
        className="heatmap-settings-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-progress": `${progress}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </span>
  );
}

function PaletteColorButton({ color, label, open, onToggle, onSelect }) {
  const current = normalizeHexColor(color, "#93c5fd");
  const buttonRef = useRef(null);
  const [paletteStyle, setPaletteStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPaletteStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      setPaletteStyle({
        position: "fixed",
        top: `${Math.round(rect.bottom + 6)}px`,
        left: `${Math.round(rect.right)}px`,
        right: "auto",
        bottom: "auto",
        transform: "translateX(-100%)",
        zIndex: 2000
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div
      className={`temp-layers-picker-color region-bounds-color-picker${
        open ? " region-bounds-color-picker--open" : ""
      }`}
    >
      <button
        ref={buttonRef}
        type="button"
        className="temp-layers-picker-color-btn temp-layers-picker-color-btn--custom"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        title={label}
        style={{ backgroundColor: current, "--temp-layer-color": current }}
        onClick={() => onToggle()}
      />
      {open && paletteStyle
        ? createPortal(
            <div
              className="temp-layers-picker-palette region-bounds-color-palette"
              role="listbox"
              aria-label={label}
              style={paletteStyle}
            >
              <div className="temp-layers-picker-palette-grid">
                {TEMP_LAYER_MARKER_PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={`temp-layers-picker-palette-swatch${
                      current === swatch ? " temp-layers-picker-palette-swatch--selected" : ""
                    }`}
                    role="option"
                    aria-selected={current === swatch}
                    aria-label={swatch}
                    title={swatch}
                    style={{ backgroundColor: swatch }}
                    onClick={() => onSelect(swatch)}
                  />
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/** Поля стиля контуров субъектов — встраиваются в панель регионов. */
export default function RegionBoundsDisplaySettings({
  settings,
  onSettingsChange,
  onRandomizeColors,
  onClearFeatureColors,
  randomizeDisabled = false
}) {
  const value = settings ?? createDefaultRegionBoundsSettings();
  const [openPicker, setOpenPicker] = useState(null);
  const [styleId, setStyleId] = useState(DEFAULT_REGION_RANDOM_STYLE);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const styleMenuRef = useRef(null);

  useEffect(() => {
    if (!openPicker && !styleMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (styleMenuRef.current?.contains(event.target)) {
        return;
      }
      if (rootRef.current?.contains(event.target)) {
        if (!styleMenuRef.current?.contains(event.target)) {
          setStyleMenuOpen(false);
        }
        return;
      }
      if (event.target.closest?.(".region-bounds-color-palette")) {
        return;
      }
      setOpenPicker(null);
      setStyleMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenPicker(null);
        setStyleMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPicker, styleMenuOpen]);

  const patch = (partial) => {
    onSettingsChange?.({ ...value, ...partial });
  };

  return (
    <div className="region-bounds-settings-fields" ref={rootRef}>
      <FieldRow label="Заливка">
        <span className="region-bounds-settings-control-row">
          <RangeInput
            min={0}
            max={100}
            step={1}
            value={Math.round(Number(value.fillOpacity) * 100)}
            formatValue={(percent) => `${percent}%`}
            onChange={(percent) => patch({ fillOpacity: percent / 100 })}
          />
          <PaletteColorButton
            color={value.fillColor}
            label="Цвет заливки"
            open={openPicker === "fill"}
            onToggle={() => setOpenPicker((current) => (current === "fill" ? null : "fill"))}
            onSelect={(fillColor) => {
              patch({ fillColor });
              setOpenPicker(null);
            }}
          />
        </span>
      </FieldRow>
      <FieldRow label="Граница">
        <span className="region-bounds-settings-control-row">
          <RangeInput
            min={0}
            max={6}
            step={0.1}
            value={value.lineWidth}
            onChange={(lineWidth) => patch({ lineWidth: Number(lineWidth.toFixed(1)) })}
          />
          <PaletteColorButton
            color={value.lineColor}
            label="Цвет границы"
            open={openPicker === "line"}
            onToggle={() => setOpenPicker((current) => (current === "line" ? null : "line"))}
            onSelect={(lineColor) => {
              patch({ lineColor });
              setOpenPicker(null);
            }}
          />
        </span>
      </FieldRow>
      <div className="heatmap-settings-actions region-bounds-settings-actions">
        <button
          type="button"
          className="heatmap-settings-reset"
          onClick={() => onRandomizeColors?.(styleId)}
          disabled={!onRandomizeColors || randomizeDisabled}
        >
          Случайно
        </button>
        <div className="region-bounds-style-menu" ref={styleMenuRef}>
          <button
            type="button"
            className={`region-bounds-style-btn${styleMenuOpen ? " region-bounds-style-btn--open" : ""}`}
            onClick={() => {
              setOpenPicker(null);
              setStyleMenuOpen((open) => !open);
            }}
            disabled={randomizeDisabled}
            aria-haspopup="menu"
            aria-expanded={styleMenuOpen}
            title={getRegionRandomStylePreset(styleId).label}
          >
            Стиль
            <span aria-hidden="true">▾</span>
          </button>
          {styleMenuOpen ? (
            <ul className="region-bounds-style-dropdown" role="menu" aria-label="Стиль случайной окраски">
              {REGION_RANDOM_STYLE_PRESETS.map((preset) => (
                <li key={preset.id} role="none">
                  <button
                    type="button"
                    className={`region-bounds-style-option${
                      styleId === preset.id ? " region-bounds-style-option--active" : ""
                    }`}
                    role="menuitem"
                    onClick={() => {
                      setStyleId(preset.id);
                      setStyleMenuOpen(false);
                      onRandomizeColors?.(preset.id);
                    }}
                  >
                    <span className="region-bounds-style-option-swatches" aria-hidden="true">
                      {preset.colors.slice(0, 4).map((color) => (
                        <span
                          key={color}
                          className="region-bounds-style-option-swatch"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    {preset.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          className="heatmap-settings-reset"
          onClick={() => {
            onSettingsChange?.(createDefaultRegionBoundsSettings());
            onClearFeatureColors?.();
          }}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}
