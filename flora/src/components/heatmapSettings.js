/** Настройки слоя heatmap по paint-свойствам Mapbox Style Spec. */

export const HEATMAP_COLOR_PRESETS = {
  classic: [
    { density: 0, color: "#2166ac", alpha: 0 },
    { density: 0.2, color: "#67a9cf", alpha: 1 },
    { density: 0.4, color: "#d1e5f0", alpha: 1 },
    { density: 0.6, color: "#fddbc7", alpha: 1 },
    { density: 0.8, color: "#ef8a62", alpha: 1 },
    { density: 1, color: "#b2182b", alpha: 1 }
  ],
  mapbox: [
    { density: 0, color: "#0000ff", alpha: 0 },
    { density: 0.1, color: "#4169e1", alpha: 1 },
    { density: 0.3, color: "#00ffff", alpha: 1 },
    { density: 0.5, color: "#00ff00", alpha: 1 },
    { density: 0.7, color: "#ffff00", alpha: 1 },
    { density: 1, color: "#ff0000", alpha: 1 }
  ],
  fire: [
    { density: 0, color: "#000000", alpha: 0 },
    { density: 0.2, color: "#4a044e", alpha: 1 },
    { density: 0.45, color: "#c2410c", alpha: 1 },
    { density: 0.7, color: "#facc15", alpha: 1 },
    { density: 1, color: "#fff7ed", alpha: 1 }
  ],
  teal: [
    { density: 0, color: "#134e4a", alpha: 0 },
    { density: 0.25, color: "#0f766e", alpha: 1 },
    { density: 0.5, color: "#14b8a6", alpha: 1 },
    { density: 0.75, color: "#99f6e4", alpha: 1 },
    { density: 1, color: "#f0fdfa", alpha: 1 }
  ],
  gray: [
    { density: 0, color: "#111827", alpha: 0 },
    { density: 0.35, color: "#6b7280", alpha: 1 },
    { density: 0.7, color: "#d1d5db", alpha: 1 },
    { density: 1, color: "#ffffff", alpha: 1 }
  ]
};

export const HEATMAP_PRESET_LABELS = {
  classic: "Классическая",
  mapbox: "Mapbox",
  fire: "Огонь",
  teal: "Бирюза",
  gray: "Чёрно-белая"
};

export const CUSTOM_PALETTE_ID = "custom";
export const CUSTOM_PALETTE_LABEL = "Пользовательский";

export const DEFAULT_HEATMAP_SETTINGS = {
  weight: 1,
  intensityMin: 1,
  intensityMax: 3,
  intensityZoom: 9,
  radiusMin: 2,
  radiusMax: 20,
  radiusZoom: 9,
  opacity: 0.75,
  fadeWithZoom: false,
  fadeZoomStart: 14,
  fadeZoomEnd: 16,
  minzoom: 0,
  maxzoom: 22,
  paletteId: "classic",
  colorStops: HEATMAP_COLOR_PRESETS.classic
};

export function cloneColorStops(stops) {
  return (stops ?? []).map((stop) => ({
    density: Number(stop.density),
    color: stop.color,
    alpha: stop.alpha ?? 1
  }));
}

function colorStopsMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((stop, index) => {
    const other = right[index];
    return (
      Number(stop.density) === Number(other.density) &&
      String(stop.color).toLowerCase() === String(other.color).toLowerCase() &&
      Number(stop.alpha ?? 1) === Number(other.alpha ?? 1)
    );
  });
}

export function matchHeatmapColorPreset(stops) {
  return (
    Object.keys(HEATMAP_COLOR_PRESETS).find((key) =>
      colorStopsMatch(stops, HEATMAP_COLOR_PRESETS[key])
    ) ?? null
  );
}

export function resolveHeatmapPaletteId(settings) {
  if (settings?.paletteId === CUSTOM_PALETTE_ID) {
    return CUSTOM_PALETTE_ID;
  }
  if (settings?.paletteId && HEATMAP_COLOR_PRESETS[settings.paletteId]) {
    return settings.paletteId;
  }
  return matchHeatmapColorPreset(settings?.colorStops) ?? "classic";
}

export function createDefaultHeatmapSettings() {
  return {
    ...DEFAULT_HEATMAP_SETTINGS,
    colorStops: cloneColorStops(DEFAULT_HEATMAP_SETTINGS.colorStops)
  };
}

export const HEATMAP_SETTINGS_KIND = "flora35-heatmap-settings";
export const HEATMAP_SETTINGS_VERSION = 1;
export const HEATMAP_SETTINGS_FILENAME = "flora35-heatmap-settings.cfg";
const HEATMAP_SETTINGS_STORAGE_KEY = "flora35-heatmap-settings";

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function normalizeHexColor(value) {
  const text = String(value ?? "").trim();
  const hex = text.startsWith("#") ? text.slice(1) : text;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return `#${hex.toLowerCase()}`;
}

function normalizeColorStop(stop) {
  if (!stop || typeof stop !== "object") {
    return null;
  }
  const color = normalizeHexColor(stop.color);
  if (!color) {
    return null;
  }
  return {
    density: clampNumber(stop.density, 0, 1, 0),
    color,
    alpha: clampNumber(stop.alpha, 0, 1, 1)
  };
}

/** Приводит произвольный объект к валидным настройкам heatmap. */
export function normalizeHeatmapSettings(raw, { fromFile = false } = {}) {
  const base = createDefaultHeatmapSettings();
  const source =
    raw && typeof raw === "object" && raw.settings && typeof raw.settings === "object"
      ? raw.settings
      : raw && typeof raw === "object"
        ? raw
        : {};

  const colorStops = Array.isArray(source.colorStops)
    ? source.colorStops.map(normalizeColorStop).filter(Boolean)
    : [];
  const nextStops = colorStops.length >= 2 ? colorStops : base.colorStops;
  let paletteId = source.paletteId;
  if (fromFile) {
    paletteId = CUSTOM_PALETTE_ID;
  } else if (paletteId !== CUSTOM_PALETTE_ID && !HEATMAP_COLOR_PRESETS[paletteId]) {
    paletteId = matchHeatmapColorPreset(nextStops) ?? base.paletteId;
  }

  return {
    weight: clampNumber(source.weight, 0, 10, base.weight),
    intensityMin: clampNumber(source.intensityMin, 0, 10, base.intensityMin),
    intensityMax: clampNumber(source.intensityMax, 0, 10, base.intensityMax),
    intensityZoom: clampNumber(source.intensityZoom, 1, 22, base.intensityZoom),
    radiusMin: clampNumber(source.radiusMin, 1, 80, base.radiusMin),
    radiusMax: clampNumber(source.radiusMax, 1, 80, base.radiusMax),
    radiusZoom: clampNumber(source.radiusZoom, 1, 22, base.radiusZoom),
    opacity: clampNumber(source.opacity, 0, 1, base.opacity),
    fadeWithZoom: Boolean(source.fadeWithZoom),
    fadeZoomStart: clampNumber(source.fadeZoomStart, 0, 21, base.fadeZoomStart),
    fadeZoomEnd: clampNumber(source.fadeZoomEnd, 1, 22, base.fadeZoomEnd),
    minzoom: clampNumber(source.minzoom, 0, 22, base.minzoom),
    maxzoom: clampNumber(source.maxzoom, 0, 22, base.maxzoom),
    paletteId,
    colorStops: nextStops
  };
}

export function buildHeatmapSettingsDocument(settings) {
  return {
    kind: HEATMAP_SETTINGS_KIND,
    version: HEATMAP_SETTINGS_VERSION,
    savedAt: new Date().toISOString(),
    settings: normalizeHeatmapSettings(settings)
  };
}

export function parseHeatmapSettingsDocument(data, options = {}) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Некорректный файл настроек");
  }
  if (parsed.kind && parsed.kind !== HEATMAP_SETTINGS_KIND) {
    throw new Error("Это не файл настроек тепловой карты Flora35");
  }
  return normalizeHeatmapSettings(parsed, options);
}

export function downloadHeatmapSettingsFile(settings) {
  const blob = new Blob([JSON.stringify(buildHeatmapSettingsDocument(settings), null, 2)], {
    type: "text/plain;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = HEATMAP_SETTINGS_FILENAME;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readHeatmapSettingsFile(file) {
  const text = await file.text();
  return parseHeatmapSettingsDocument(text, { fromFile: true });
}

export function loadHeatmapSettingsFromStorage() {
  if (typeof window === "undefined") {
    return createDefaultHeatmapSettings();
  }
  try {
    const raw = window.localStorage.getItem(HEATMAP_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return createDefaultHeatmapSettings();
    }
    return parseHeatmapSettingsDocument(JSON.parse(raw));
  } catch {
    return createDefaultHeatmapSettings();
  }
}

export function saveHeatmapSettingsToStorage(settings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      HEATMAP_SETTINGS_STORAGE_KEY,
      JSON.stringify(buildHeatmapSettingsDocument(settings))
    );
  } catch {
    // квота / приватный режим — настройки остаются только в памяти
  }
}

export function hexToRgba(hex, alpha = 1) {
  const value = String(hex ?? "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return `rgba(74,144,226,${alpha})`;
  }
  const n = Number.parseInt(value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildHeatmapColorExpression(stops) {
  const sorted = cloneColorStops(stops).sort((left, right) => left.density - right.density);
  const expression = ["interpolate", ["linear"], ["heatmap-density"]];
  if (sorted.length === 0) {
    expression.push(0, "rgba(0,0,0,0)", 1, "rgba(178,24,43,1)");
    return expression;
  }
  sorted.forEach((stop) => {
    expression.push(Math.min(1, Math.max(0, stop.density)));
    expression.push(hexToRgba(stop.color, Math.min(1, Math.max(0, stop.alpha))));
  });
  return expression;
}

function zoomInterpolate(lowValue, highZoom, highValue, minValue = 0) {
  const zoom = Math.max(0, Number(highZoom) || 0);
  const low = Math.max(minValue, Number(lowValue) || 0);
  const high = Math.max(minValue, Number(highValue) || 0);
  return ["interpolate", ["linear"], ["zoom"], 0, low, zoom, high];
}

/** Собирает paint-объект heatmap по настройкам панели. */
export function buildHeatmapPaint(settings, colorOverride) {
  const next = { ...DEFAULT_HEATMAP_SETTINGS, ...settings };
  const opacity = next.fadeWithZoom
    ? [
        "interpolate",
        ["linear"],
        ["zoom"],
        Math.max(0, next.fadeZoomStart),
        Math.min(1, Math.max(0, next.opacity)),
        Math.max(next.fadeZoomStart + 0.1, next.fadeZoomEnd),
        0
      ]
    : Math.min(1, Math.max(0, next.opacity));

  return {
    "heatmap-weight": Math.max(0, Number(next.weight) || 0),
    "heatmap-intensity": zoomInterpolate(next.intensityMin, next.intensityZoom, next.intensityMax, 0),
    "heatmap-radius": zoomInterpolate(next.radiusMin, next.radiusZoom, next.radiusMax, 1),
    "heatmap-opacity": opacity,
    "heatmap-color": colorOverride ?? buildHeatmapColorExpression(next.colorStops)
  };
}
