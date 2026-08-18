import React, { useEffect } from "react";
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

export default function RegionBoundsSettingsPanel({
  open = false,
  settings,
  onSettingsChange,
  onClose
}) {
  const value = settings ?? createDefaultRegionBoundsSettings();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const patch = (partial) => {
    onSettingsChange?.({ ...value, ...partial });
  };

  return (
    <div className="heatmap-settings-overlay" onClick={() => onClose?.()}>
      <div
        className="heatmap-settings-dialog region-bounds-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-bounds-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="heatmap-settings-close"
          onClick={() => onClose?.()}
          aria-label="Закрыть"
        >
          ×
        </button>
        <h3 id="region-bounds-settings-title" className="heatmap-settings-title">
          Отображение регионов
        </h3>
        <div className="region-bounds-settings-fields">
          <FieldRow label="Прозрачность" hint="заливка, 0–1">
            <RangeInput
              min={0}
              max={1}
              step={0.01}
              value={value.fillOpacity}
              onChange={(fillOpacity) =>
                patch({ fillOpacity: Number(fillOpacity.toFixed(2)) })
              }
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
        </div>
        <div className="heatmap-settings-actions">
          <button
            type="button"
            className="heatmap-settings-reset"
            onClick={() => onSettingsChange?.(createDefaultRegionBoundsSettings())}
          >
            Сбросить
          </button>
        </div>
      </div>
    </div>
  );
}
