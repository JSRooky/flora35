/** Цвета маркеров по царству — общие для локальных точек и GBIF. */
export const REGNUM_COLORS = {
  plantae: "#588f38",
  animalia: "#c98263",
  fungi: "#7a5d8f",
  protozoa: "#2a8f9e"
};

export const DEFAULT_CLUSTER_REGNUM_COLORS = Object.freeze({ ...REGNUM_COLORS });
export const CLUSTER_REGNUM_COLORS = { ...DEFAULT_CLUSTER_REGNUM_COLORS };

const CLUSTER_REGNUM_COLORS_STORAGE_KEY = "flora35-cluster-regnum-colors";
const CLUSTER_REGNUM_COLOR_KEYS = Object.keys(DEFAULT_CLUSTER_REGNUM_COLORS);

export function normalizeClusterRegnumColors(value) {
  const colors = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    CLUSTER_REGNUM_COLOR_KEYS.map((key) => {
      const color = String(colors[key] ?? "").trim();
      return [
        key,
        /^#[0-9a-f]{6}$/i.test(color)
          ? color.toLowerCase()
          : DEFAULT_CLUSTER_REGNUM_COLORS[key]
      ];
    })
  );
}

export function applyClusterRegnumColors(value) {
  Object.assign(CLUSTER_REGNUM_COLORS, normalizeClusterRegnumColors(value));
}

export function loadClusterRegnumColorsFromStorage() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_CLUSTER_REGNUM_COLORS };
  }
  try {
    const raw = window.localStorage.getItem(CLUSTER_REGNUM_COLORS_STORAGE_KEY);
    return normalizeClusterRegnumColors(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_CLUSTER_REGNUM_COLORS };
  }
}

export function saveClusterRegnumColorsToStorage(value) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      CLUSTER_REGNUM_COLORS_STORAGE_KEY,
      JSON.stringify(normalizeClusterRegnumColors(value))
    );
  } catch {
    // квота / приватный режим — настройки остаются только в памяти
  }
}

export function getClusterRegnumColor(regnum) {
  const key = regnum ? String(regnum).toLowerCase() : "";
  return CLUSTER_REGNUM_COLORS[key] ?? DEFAULT_CLUSTER_COLOR;
}

export const DEFAULT_POINT_COLOR = "#4a90e2";
export const DEFAULT_CLUSTER_COLOR = "#4a90e2";

/** Цвет точки по regnum (растение/животное/гриб/простейшие), с запасным цветом по умолчанию. */
export function getPointColorForRegnum(regnum) {
  const key = regnum ? String(regnum).toLowerCase() : "";
  return REGNUM_COLORS[key] ?? DEFAULT_POINT_COLOR;
}

/** Mapbox-выражение окраски кружка по properties.regnum. */
export function getPointColorExpression() {
  return [
    "match",
    ["downcase", ["coalesce", ["get", "regnum"], ""]],
    "plantae",
    REGNUM_COLORS.plantae,
    "animalia",
    REGNUM_COLORS.animalia,
    "fungi",
    REGNUM_COLORS.fungi,
    "protozoa",
    REGNUM_COLORS.protozoa,
    DEFAULT_POINT_COLOR
  ];
}
