import React from "react";
import {
  createDefaultRegionBoundsSettings,
  normalizeHexColor
} from "./regionBoundsSettings";
import "../styles/HeatmapSettingsPanel.css";
import "../styles/RegionBoundsSettingsPanel.css";

function FieldRow({ label, hint, children }) {
  return (
    <label className="heatmap-settings-field">
      <span className="heatmap-settings-field-label">
        {label}
        {hint ? <span className="heatmap-settings-field-hint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function RangeInput({ value, min, max, step, onChange }) {
  const span = max - min;
  const progress = span <= 0 ? 0 : ((Number(value) - min) / span) * 100;
  return (
    <span className="heatmap-settings-range">
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
      <span className="heatmap-settings-range-value">{value}</span>
    </span>
  );
}

/** Поля стиля контуров субъектов — встраиваются в панель регионов. */
export default function RegionBoundsDisplaySettings({ settings, onSettingsChange }) {
  const value = settings ?? createDefaultRegionBoundsSettings();

  const patch = (partial) => {
    onSettingsChange?.({ ...value, ...partial });
  };

  return (
    <div className="region-bounds-settings-fields">
      <FieldRow label="Прозрачность" hint="заливка, 0–1">
        <RangeInput
          min={0}
          max={1}
          step={0.01}
          value={value.fillOpacity}
          onChange={(fillOpacity) => patch({ fillOpacity: Number(fillOpacity.toFixed(2)) })}
        />
      </FieldRow>
      <FieldRow label="Ширина границы" hint="пиксели">
        <RangeInput
          min={0}
          max={6}
          step={0.1}
          value={value.lineWidth}
          onChange={(lineWidth) => patch({ lineWidth: Number(lineWidth.toFixed(1)) })}
        />
      </FieldRow>
      <FieldRow label="Цвет заливки">
        <input
          type="color"
          className="heatmap-settings-color"
          value={normalizeHexColor(value.fillColor, "#7a5a2d")}
          onChange={(event) => patch({ fillColor: event.target.value })}
        />
      </FieldRow>
      <FieldRow label="Цвет границы">
        <input
          type="color"
          className="heatmap-settings-color"
          value={normalizeHexColor(value.lineColor, "#6b4f2a")}
          onChange={(event) => patch({ lineColor: event.target.value })}
        />
      </FieldRow>
      <button
        type="button"
        className="heatmap-settings-reset"
        onClick={() => onSettingsChange?.(createDefaultRegionBoundsSettings())}
      >
        Сбросить
      </button>
    </div>
  );
}
