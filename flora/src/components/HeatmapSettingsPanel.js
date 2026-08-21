import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  cloneColorStops,
  createDefaultHeatmapSettings,
  CUSTOM_PALETTE_ID,
  CUSTOM_PALETTE_LABEL,
  downloadHeatmapSettingsFile,
  HEATMAP_COLOR_PRESETS,
  HEATMAP_PRESET_LABELS,
  hexToRgba,
  readHeatmapSettingsFile,
  resolveHeatmapPaletteId
} from "./heatmapSettings";
import "../styles/HeatmapSettingsPanel.css";

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

function sortedColorStops(stops) {
  return cloneColorStops(stops).sort((left, right) => left.density - right.density);
}

const PREVIEW_POINTS = [
  { x: 0.18, y: 0.28, scale: 0.42, gain: 0.5 },
  { x: 0.28, y: 0.22, scale: 0.36, gain: 0.42 },
  { x: 0.24, y: 0.38, scale: 0.5, gain: 0.58 },
  { x: 0.36, y: 0.32, scale: 0.44, gain: 0.5 },
  { x: 0.42, y: 0.46, scale: 1, gain: 1 },
  { x: 0.5, y: 0.4, scale: 0.72, gain: 0.78 },
  { x: 0.54, y: 0.54, scale: 0.58, gain: 0.64 },
  { x: 0.38, y: 0.58, scale: 0.4, gain: 0.48 },
  { x: 0.64, y: 0.36, scale: 0.62, gain: 0.7 },
  { x: 0.72, y: 0.3, scale: 0.34, gain: 0.4 },
  { x: 0.7, y: 0.48, scale: 0.48, gain: 0.55 },
  { x: 0.78, y: 0.58, scale: 0.32, gain: 0.38 },
  { x: 0.16, y: 0.62, scale: 0.3, gain: 0.36 },
  { x: 0.58, y: 0.72, scale: 0.38, gain: 0.44 },
  { x: 0.48, y: 0.68, scale: 0.28, gain: 0.34 }
];

function parseHexRgb(hex) {
  const value = String(hex || "").replace("#", "");
  const n = parseInt(value.length === 3 ? value.replace(/(.)/g, "$1$1") : value, 16);
  if (Number.isNaN(n)) {
    return [0, 0, 0];
  }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sampleColorRamp(stops, density) {
  const t = Math.min(1, Math.max(0, density));
  if (!stops.length) {
    return [0, 0, 0, 0];
  }
  if (t <= stops[0].density) {
    const [r, g, b] = parseHexRgb(stops[0].color);
    return [r, g, b, Number(stops[0].alpha) || 0];
  }
  const last = stops[stops.length - 1];
  if (t >= last.density) {
    const [r, g, b] = parseHexRgb(last.color);
    return [r, g, b, Number(last.alpha) || 0];
  }
  let i = 1;
  while (i < stops.length && t > stops[i].density) {
    i += 1;
  }
  const a = stops[i - 1];
  const bStop = stops[i];
  const span = bStop.density - a.density || 1;
  const u = (t - a.density) / span;
  const [ar, ag, ab] = parseHexRgb(a.color);
  const [br, bg, bb] = parseHexRgb(bStop.color);
  return [
    ar + (br - ar) * u,
    ag + (bg - ag) * u,
    ab + (bb - ab) * u,
    (Number(a.alpha) || 0) + ((Number(bStop.alpha) || 0) - (Number(a.alpha) || 0)) * u
  ];
}

function drawHeatmapPreview(canvas, settings) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) {
    return;
  }

  const stops = sortedColorStops(settings.colorStops);
  const density = new Float32Array(width * height);
  const radiusMax = Number(settings.radiusMax) || 20;
  const intensity = Number(settings.intensityMax) || 1;
  const weight = Number(settings.weight) || 1;
  const opacity = Math.min(1, Math.max(0, Number(settings.opacity) || 0.75));
  const baseSigma = Math.max(6, (18 + radiusMax * 1.35) * (width / 280) * 0.42);

  PREVIEW_POINTS.forEach((point) => {
    const cx = point.x * width;
    const cy = point.y * height;
    const sigma = Math.max(3, baseSigma * point.scale);
    const peak = weight * intensity * point.gain * 0.22;
    const reach = sigma * 3.2;
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(width - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const y1 = Math.min(height - 1, Math.ceil(cy + reach));
    const twoSigmaSq = 2 * sigma * sigma;
    for (let y = y0; y <= y1; y += 1) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        density[y * width + x] += peak * Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
      }
    }
  });

  const image = ctx.createImageData(width, height);
  const pixels = image.data;
  for (let i = 0; i < density.length; i += 1) {
    const [r, g, b, a] = sampleColorRamp(stops, density[i]);
    const o = i * 4;
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
    pixels[o + 3] = Math.round(a * opacity * 255);
  }
  ctx.putImageData(image, 0, 0);
}

function HeatmapSettingsPreview({ settings }) {
  const mapRef = useRef(null);
  const canvasRef = useRef(null);
  const stops = sortedColorStops(settings.colorStops);
  const ramp = stops
    .map((stop) => `${hexToRgba(stop.color, stop.alpha)} ${Math.round(stop.density * 100)}%`)
    .join(", ");

  useLayoutEffect(() => {
    const mapEl = mapRef.current;
    const canvas = canvasRef.current;
    if (!mapEl || !canvas) {
      return undefined;
    }

    const render = () => {
      const rect = mapEl.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      drawHeatmapPreview(canvas, settings);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(mapEl);
    return () => observer.disconnect();
  }, [settings]);

  return (
    <div className="heatmap-settings-preview" aria-hidden="true">
      <p className="heatmap-settings-preview-title">Предпросмотр</p>
      <div className="heatmap-settings-preview-map" ref={mapRef}>
        <canvas className="heatmap-settings-preview-canvas" ref={canvasRef} />
      </div>
      <div
        className="heatmap-settings-preview-ramp"
        style={{ background: `linear-gradient(to right, ${ramp})` }}
      />
      <div className="heatmap-settings-preview-ramp-labels">
        <span>редко</span>
        <span>плотно</span>
      </div>
      <p className="heatmap-settings-preview-meta">
        радиус {settings.radiusMax} · интенсивность {settings.intensityMax} · прозрачность{" "}
        {settings.opacity}
      </p>
    </div>
  );
}

/** Всплывающее окно paint-настроек heatmap Mapbox. */
export default function HeatmapSettingsPanel({
  open = false,
  settings,
  onSettingsChange,
  onClose
}) {
  const value = settings ?? createDefaultHeatmapSettings();
  const fileInputRef = useRef(null);
  const [fileMessage, setFileMessage] = useState(null);

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

  const markCustomPalette = (partial) => {
    patch({ ...partial, paletteId: CUSTOM_PALETTE_ID });
  };

  const updateStop = (index, partial) => {
    const colorStops = cloneColorStops(value.colorStops);
    colorStops[index] = { ...colorStops[index], ...partial };
    markCustomPalette({ colorStops });
  };

  const addStop = () => {
    const colorStops = cloneColorStops(value.colorStops);
    const last = colorStops[colorStops.length - 1];
    colorStops.push({
      density: last ? Math.min(1, Number((last.density + 0.1).toFixed(2))) : 0.5,
      color: last?.color ?? "#ef8a62",
      alpha: 1
    });
    markCustomPalette({ colorStops });
  };

  const removeStop = (index) => {
    const colorStops = cloneColorStops(value.colorStops).filter((_, i) => i !== index);
    if (colorStops.length < 2) {
      return;
    }
    markCustomPalette({ colorStops });
  };

  const paletteId = resolveHeatmapPaletteId(value);

  return (
    <div className="heatmap-settings-overlay" onClick={() => onClose?.()}>
      <div
        className="heatmap-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="heatmap-settings-title"
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
        <h3 id="heatmap-settings-title" className="heatmap-settings-title">
          Настройки тепловой карты
        </h3>
        <div className="heatmap-settings-grid">
          <div className="heatmap-settings-column">
            <h4 className="heatmap-settings-section-title">Вес точки</h4>
            <FieldRow label="Вес точки" hint="вклад одной точки, ≥ 0">
              <RangeInput
                min={0}
                max={10}
                step={0.1}
                value={value.weight}
                onChange={(weight) => patch({ weight })}
              />
            </FieldRow>

            <h4 className="heatmap-settings-section-title">Интенсивность</h4>
            <FieldRow label="На зуме 0" hint="глобальный множитель веса">
              <RangeInput
                min={0}
                max={10}
                step={0.1}
                value={value.intensityMin}
                onChange={(intensityMin) => patch({ intensityMin })}
              />
            </FieldRow>
            <FieldRow label={`На зуме ${value.intensityZoom}`}>
              <RangeInput
                min={0}
                max={10}
                step={0.1}
                value={value.intensityMax}
                onChange={(intensityMax) => patch({ intensityMax })}
              />
            </FieldRow>
            <FieldRow label="Зум верхней точки">
              <RangeInput
                min={1}
                max={22}
                step={1}
                value={value.intensityZoom}
                onChange={(intensityZoom) => patch({ intensityZoom })}
              />
            </FieldRow>

            <h4 className="heatmap-settings-section-title">Радиус расширения</h4>
            <FieldRow label="На зуме 0" hint="пиксели, ≥ 1">
              <RangeInput
                min={1}
                max={80}
                step={1}
                value={value.radiusMin}
                onChange={(radiusMin) => patch({ radiusMin })}
              />
            </FieldRow>
            <FieldRow label={`На зуме ${value.radiusZoom}`}>
              <RangeInput
                min={1}
                max={80}
                step={1}
                value={value.radiusMax}
                onChange={(radiusMax) => patch({ radiusMax })}
              />
            </FieldRow>
            <FieldRow label="Зум верхней точки">
              <RangeInput
                min={1}
                max={22}
                step={1}
                value={value.radiusZoom}
                onChange={(radiusZoom) => patch({ radiusZoom })}
              />
            </FieldRow>

            <h4 className="heatmap-settings-section-title">Прозрачность</h4>
            <FieldRow label="Прозрачность" hint="0–1">
              <RangeInput
                min={0}
                max={1}
                step={0.05}
                value={value.opacity}
                onChange={(opacity) => patch({ opacity })}
              />
            </FieldRow>
            <label className="map-display-switch heatmap-settings-switch">
              <input
                type="checkbox"
                checked={value.fadeWithZoom}
                onChange={(event) => patch({ fadeWithZoom: event.target.checked })}
              />
              <span className="map-display-switch-slider" />
              <span className="map-display-switch-label">Скрывать на крупном зуме</span>
            </label>
            {value.fadeWithZoom ? (
              <>
                <FieldRow label="Начать затухание">
                  <RangeInput
                    min={0}
                    max={21}
                    step={1}
                    value={value.fadeZoomStart}
                    onChange={(fadeZoomStart) => patch({ fadeZoomStart })}
                  />
                </FieldRow>
                <FieldRow label="Полностью скрыть">
                  <RangeInput
                    min={1}
                    max={22}
                    step={1}
                    value={value.fadeZoomEnd}
                    onChange={(fadeZoomEnd) => patch({ fadeZoomEnd })}
                  />
                </FieldRow>
              </>
            ) : null}

            <h4 className="heatmap-settings-section-title">Показ при увеличении карты</h4>
            <FieldRow label="Показывать с зума">
              <RangeInput
                min={0}
                max={22}
                step={1}
                value={value.minzoom}
                onChange={(minzoom) => patch({ minzoom })}
              />
            </FieldRow>
            <FieldRow label="Показывать до зума">
              <RangeInput
                min={0}
                max={22}
                step={1}
                value={value.maxzoom}
                onChange={(maxzoom) => patch({ maxzoom })}
              />
            </FieldRow>
          </div>

          <div className="heatmap-settings-column">
            <h4 className="heatmap-settings-section-title">Цвета тепловой карты</h4>
            <FieldRow label="Палитра" hint="по heatmap-density 0…1">
              <select
                className="heatmap-settings-select"
                value={paletteId}
                onChange={(event) => {
                  const key = event.target.value;
                  if (key === CUSTOM_PALETTE_ID) {
                    markCustomPalette({});
                    return;
                  }
                  if (HEATMAP_COLOR_PRESETS[key]) {
                    patch({
                      paletteId: key,
                      colorStops: cloneColorStops(HEATMAP_COLOR_PRESETS[key])
                    });
                  }
                }}
              >
                <option value="" disabled>
                  Профиль...
                </option>
                <option value={CUSTOM_PALETTE_ID}>{CUSTOM_PALETTE_LABEL}</option>
                {Object.keys(HEATMAP_COLOR_PRESETS).map((key) => (
                  <option key={key} value={key}>
                    {HEATMAP_PRESET_LABELS[key] ?? key}
                  </option>
                ))}
              </select>
            </FieldRow>

            <div className="heatmap-settings-stops">
              {value.colorStops.map((stop, index) => (
                <div key={`${stop.density}-${index}`} className="heatmap-settings-stop">
                  <input
                    type="number"
                    className="heatmap-settings-density"
                    min={0}
                    max={1}
                    step={0.05}
                    value={stop.density}
                    aria-label={`Плотность стопа ${index + 1}`}
                    onChange={(event) => updateStop(index, { density: Number(event.target.value) })}
                  />
                  <input
                    type="color"
                    className="heatmap-settings-color"
                    value={stop.color}
                    aria-label={`Цвет стопа ${index + 1}`}
                    onChange={(event) => updateStop(index, { color: event.target.value })}
                  />
                  <input
                    type="range"
                    className="heatmap-settings-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={stop.alpha}
                    style={{ "--range-progress": `${(stop.alpha ?? 0) * 100}%` }}
                    aria-label={`Прозрачность стопа ${index + 1}`}
                    onChange={(event) => updateStop(index, { alpha: Number(event.target.value) })}
                  />
                  <button
                    type="button"
                    className="heatmap-settings-stop-remove"
                    disabled={value.colorStops.length <= 2}
                    aria-label="Удалить стоп"
                    onClick={() => removeStop(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="heatmap-settings-actions">
              <button type="button" className="heatmap-settings-add-stop" onClick={addStop}>
                Добавить стоп
              </button>
              <button
                type="button"
                className="heatmap-settings-reset"
                onClick={() => onSettingsChange?.(createDefaultHeatmapSettings())}
              >
                Сбросить
              </button>
            </div>
            <div className="heatmap-settings-actions">
              <button
                type="button"
                className="heatmap-settings-reset"
                onClick={() => downloadHeatmapSettingsFile(value)}
              >
                Сохранить настройки
              </button>
              <button
                type="button"
                className="heatmap-settings-reset"
                onClick={() => fileInputRef.current?.click()}
              >
                Загрузить настройки
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".cfg,.json,text/plain,application/json"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  try {
                    const next = await readHeatmapSettingsFile(file);
                    onSettingsChange?.(next);
                    setFileMessage("Настройки загружены");
                  } catch {
                    setFileMessage("Не удалось прочитать файл настроек");
                  }
                }}
              />
            </div>
            {fileMessage ? <p className="heatmap-settings-file-message">{fileMessage}</p> : null}
            <HeatmapSettingsPreview settings={value} />
          </div>
        </div>
      </div>
    </div>
  );
}
