/** Цвета маркеров по царству — общие для локальных точек и GBIF. */
export const REGNUM_COLORS = {
  plantae: "#588f38",
  animalia: "#c98263",
  fungi: "#7a5d8f"
};

export const DEFAULT_POINT_COLOR = "#4a90e2";
export const DEFAULT_CLUSTER_COLOR = "#4a90e2";

/** Цвет точки по regnum (растение/животное/гриб), с запасным цветом по умолчанию. */
export function getPointColorForRegnum(regnum) {
  return REGNUM_COLORS[regnum] ?? DEFAULT_POINT_COLOR;
}

/** Mapbox-выражение окраски кружка по properties.regnum. */
export function getPointColorExpression() {
  return [
    "match",
    ["get", "regnum"],
    "plantae",
    REGNUM_COLORS.plantae,
    "animalia",
    REGNUM_COLORS.animalia,
    "fungi",
    REGNUM_COLORS.fungi,
    DEFAULT_POINT_COLOR
  ];
}
