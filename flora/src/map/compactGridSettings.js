const STORAGE_KEY = "flora.compactGridSettings";

export const COMPACT_GRID_FILL = "#e56a17";
export const COMPACT_GRID_STROKE = "#c4510f";

/** Допустимые значения: степень двойки, 32 — самые мелкие квадраты. */
export const COMPACT_GRID_CELLS_OPTIONS = [8, 16, 32];
export const COMPACT_GRID_CELLS_MAX = 32;
export const COMPACT_GRID_POINT_LIMIT_MIN = 5000;
export const COMPACT_GRID_POINT_LIMIT_MAX = 500000;
export const COMPACT_GRID_POINT_LIMIT_DEFAULT = 50000;

export function createDefaultCompactGridSettings() {
  return {
    pointLimit: COMPACT_GRID_POINT_LIMIT_DEFAULT,
    cellsPerTile: COMPACT_GRID_CELLS_MAX,
    useLayerColor: true,
    color: COMPACT_GRID_FILL
  };
}

export function clampCompactGridCellsPerTile(value) {
  const n = Number(value);
  if (n <= 8) {
    return 8;
  }
  if (n <= 16) {
    return 16;
  }
  return COMPACT_GRID_CELLS_MAX;
}

export function clampCompactGridPointLimit(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return COMPACT_GRID_POINT_LIMIT_DEFAULT;
  }
  return Math.min(
    COMPACT_GRID_POINT_LIMIT_MAX,
    Math.max(COMPACT_GRID_POINT_LIMIT_MIN, n)
  );
}

export function normalizeHexColor(value, fallback = COMPACT_GRID_FILL) {
  const raw = String(value || "").trim();
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return fallback;
}

export function darkenHexColor(hex, amount = 0.22) {
  const color = normalizeHexColor(hex);
  const n = parseInt(color.slice(1), 16);
  const scale = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * scale);
  const g = Math.round(((n >> 8) & 255) * scale);
  const b = Math.round((n & 255) * scale);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function sanitizeCompactGridSettings(raw) {
  const defaults = createDefaultCompactGridSettings();
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    pointLimit: clampCompactGridPointLimit(src.pointLimit ?? defaults.pointLimit),
    cellsPerTile: clampCompactGridCellsPerTile(
      src.cellsPerTile ?? defaults.cellsPerTile
    ),
    useLayerColor: src.useLayerColor !== false,
    color: normalizeHexColor(src.color, defaults.color)
  };
}

function readStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultCompactGridSettings();
    }
    return sanitizeCompactGridSettings(JSON.parse(raw));
  } catch {
    return createDefaultCompactGridSettings();
  }
}

let settings = readStoredSettings();
let displayedLayerPointCount = 0;

export function getCompactGridSettings() {
  return { ...settings };
}

export function getCompactGridPointLimit() {
  return settings.pointLimit;
}

export function setCompactDisplayedLayerPointCount(count) {
  const n = Number(count);
  displayedLayerPointCount = Number.isFinite(n) && n > 0 ? n : 0;
}

export function getCompactDisplayedLayerPointCount() {
  return displayedLayerPointCount;
}

export function shouldUseCompactDensityGrid() {
  return displayedLayerPointCount > settings.pointLimit;
}

export function getCompactGridCellsPerTile() {
  return settings.cellsPerTile;
}

export function resolveCompactGridFillColor(layerColor) {
  if (!settings.useLayerColor) {
    return settings.color;
  }
  if (layerColor) {
    return normalizeHexColor(layerColor, settings.color);
  }
  return settings.color;
}

export function setCompactGridSettings(next) {
  settings = sanitizeCompactGridSettings({ ...settings, ...next });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
  return getCompactGridSettings();
}
