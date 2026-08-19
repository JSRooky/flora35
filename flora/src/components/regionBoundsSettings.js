import { TEMP_LAYER_MARKER_PALETTE } from "../tempLayers/tempLayerStore";

const STORAGE_KEY = "flora35-region-bounds-settings-v2";

export const REGION_RANDOM_STYLE_IDS = {
  BRIGHT: "bright",
  PASTEL: "pastel",
  BLUE: "blue",
  GREEN: "green",
  GRAY: "gray"
};

export const DEFAULT_REGION_RANDOM_STYLE = REGION_RANDOM_STYLE_IDS.BLUE;

export const REGION_RANDOM_STYLE_PRESETS = [
  {
    id: REGION_RANDOM_STYLE_IDS.BRIGHT,
    label: "Яркие",
    colors: TEMP_LAYER_MARKER_PALETTE
  },
  {
    id: REGION_RANDOM_STYLE_IDS.PASTEL,
    label: "Пастельные",
    colors: [
      "#f4c6c6",
      "#f6d4b8",
      "#f3e2b3",
      "#d7ecc8",
      "#c7e8e2",
      "#c9d8f4",
      "#d9c8f0",
      "#ecc9de",
      "#e4d5c8",
      "#cfe3d4",
      "#d5e4f0",
      "#e8d9c4",
      "#f0cfd8",
      "#c8e0d0",
      "#dde3c8",
      "#cfd0e8"
    ]
  },
  {
    id: REGION_RANDOM_STYLE_IDS.BLUE,
    label: "Оттенки синего",
    colors: [
      "#dbeafe",
      "#bfdbfe",
      "#93c5fd",
      "#60a5fa",
      "#3b82f6",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#1e3a8a",
      "#38bdf8",
      "#0ea5e9",
      "#0284c7",
      "#0369a1",
      "#67e8f9",
      "#22d3ee",
      "#155e75"
    ]
  },
  {
    id: REGION_RANDOM_STYLE_IDS.GREEN,
    label: "Оттенки зелёного",
    colors: [
      "#dcfce7",
      "#bbf7d0",
      "#86efac",
      "#4ade80",
      "#22c55e",
      "#16a34a",
      "#15803d",
      "#166534",
      "#a3e635",
      "#65a30d",
      "#4d7c0f",
      "#84cc16",
      "#5eead4",
      "#14b8a6",
      "#0f766e",
      "#3f6212"
    ]
  },
  {
    id: REGION_RANDOM_STYLE_IDS.GRAY,
    label: "Оттенки серого",
    colors: [
      "#f8fafc",
      "#f1f5f9",
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#334155",
      "#e5e7eb",
      "#d1d5db",
      "#9ca3af",
      "#6b7280",
      "#4b5563",
      "#374151",
      "#a8a29e",
      "#78716c"
    ]
  }
];

export function getRegionRandomStylePreset(styleId) {
  return (
    REGION_RANDOM_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
    REGION_RANDOM_STYLE_PRESETS[0]
  );
}

export function createDefaultRegionBoundsSettings() {
  return {
    fillOpacity: 0.03,
    lineWidth: 1.1,
    fillColor: "#93c5fd",
    lineColor: "#2563eb"
  };
}

function hashToUnit(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, "#93c5fd");
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16) / 255,
    g: Number.parseInt(normalized.slice(3, 5), 16) / 255,
    b: Number.parseInt(normalized.slice(5, 7), 16) / 255
  };
}

function rgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { h: 210, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return { h: hue * 60, s: saturation, l: lightness };
}

function hueToRgb(p, q, t) {
  let tone = t;
  if (tone < 0) {
    tone += 1;
  }
  if (tone > 1) {
    tone -= 1;
  }
  if (tone < 1 / 6) {
    return p + (q - p) * 6 * tone;
  }
  if (tone < 1 / 2) {
    return q;
  }
  if (tone < 2 / 3) {
    return p + (q - p) * (2 / 3 - tone) * 6;
  }
  return p;
}

function hslToHex({ h, s, l }) {
  const saturation = Math.min(1, Math.max(0, s));
  const lightness = Math.min(1, Math.max(0, l));
  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    const hex = gray.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hue = ((h % 360) + 360) % 360 / 360;
  const r = Math.round(hueToRgb(p, q, hue + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, hue) * 255);
  const b = Math.round(hueToRgb(p, q, hue - 1 / 3) * 255);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Небольшой разброс оттенка вокруг базового цвета — стабилен для каждого ISO. */
export function createSubtleRegionColorMap(isos = [], baseHex) {
  const base = rgbToHsl(hexToRgb(baseHex || createDefaultRegionBoundsSettings().fillColor));
  return Object.fromEntries(
    isos.filter(Boolean).map((iso) => {
      const hueShift = (hashToUnit(`${iso}:h`) * 2 - 1) * 14;
      const satShift = (hashToUnit(`${iso}:s`) * 2 - 1) * 0.1;
      const lightShift = (hashToUnit(`${iso}:l`) * 2 - 1) * 0.08;
      return [
        iso,
        hslToHex({
          h: base.h + hueShift,
          s: Math.min(0.85, Math.max(0.28, base.s + satShift)),
          l: Math.min(0.82, Math.max(0.42, base.l + lightShift))
        })
      ];
    })
  );
}

export function createRandomRegionColorMap(isos = [], styleId = DEFAULT_REGION_RANDOM_STYLE) {
  const palette = getRegionRandomStylePreset(styleId).colors.slice();
  for (let index = palette.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = palette[index];
    palette[index] = palette[swapIndex];
    palette[swapIndex] = current;
  }

  return Object.fromEntries(
    isos.filter(Boolean).map((iso, index) => [iso, palette[index % palette.length]])
  );
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
