const STORAGE_KEY = "flora35-region-bounds-settings";

export function createDefaultRegionBoundsSettings() {
  return {
    fillOpacity: 0.05,
    lineWidth: 1.1,
    fillColor: "#7a5a2d",
    lineColor: "#6b4f2a"
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

export function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return fallback;
}

export function normalizeRegionBoundsSettings(raw) {
  const base = createDefaultRegionBoundsSettings();
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    fillOpacity: clamp(source.fillOpacity, 0, 1, base.fillOpacity),
    lineWidth: clamp(source.lineWidth, 0, 8, base.lineWidth),
    fillColor: normalizeHexColor(source.fillColor, base.fillColor),
    lineColor: normalizeHexColor(source.lineColor, base.lineColor)
  };
}

export function loadRegionBoundsSettingsFromStorage() {
  if (typeof window === "undefined") {
    return createDefaultRegionBoundsSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultRegionBoundsSettings();
    }
    return normalizeRegionBoundsSettings(JSON.parse(raw));
  } catch {
    return createDefaultRegionBoundsSettings();
  }
}

export function saveRegionBoundsSettingsToStorage(settings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeRegionBoundsSettings(settings))
    );
  } catch {
    // квота / приватный режим — настройки остаются только в памяти
  }
}
