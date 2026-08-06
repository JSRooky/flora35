import { area } from "@turf/turf";
import { getBoundsFeatureTitle } from "../firebase/boundsCollectionFirestore";

const BOUNDARY_LABELS = {
  national_park: "Национальный парк",
  protected_area: "ООПТ",
  boundary: "Граница"
};

/** Поля для панели сведений об объекте bounds по layer_id. */
export const BOUNDS_DISPLAY_FIELDS = {
  nature_reserve_polygon: [
    { key: "NAME_RU", label: "Название" },
    { key: "BOUNDARY", label: "Тип", format: (value) => BOUNDARY_LABELS[value] ?? value }
  ],
  oopt_pol: [
    { key: "title", label: "Название" },
    { key: "category_t", label: "Категория" },
    { key: "status_tit", label: "Статус" },
    { key: "subj_title", label: "Субъект" }
  ]
};

const NATURE_RESERVE_FILL_BY_BOUNDARY = {
  national_park: "#52966a",
  protected_area: "#5fa67a",
  boundary: "#78b088",
  default: "#68a878"
};

const BOUNDS_LAYER_FILL_COLORS = {
  oopt_pol: "#6b94c4"
};

/** Цвет заливки полигона для UI (совпадает с addBoundsLayers). */
export function getBoundsFeatureFillColor(layerId, properties = {}) {
  if (layerId === "nature_reserve_polygon") {
    return (
      NATURE_RESERVE_FILL_BY_BOUNDARY[properties.BOUNDARY] ?? NATURE_RESERVE_FILL_BY_BOUNDARY.default
    );
  }

  return BOUNDS_LAYER_FILL_COLORS[layerId] ?? NATURE_RESERVE_FILL_BY_BOUNDARY.default;
}

export function formatBoundsPropertyValue(field, properties) {
  const rawValue = properties?.[field.key];
  if (rawValue == null || rawValue === "") {
    return null;
  }

  if (field.format) {
    return field.format(rawValue);
  }

  return String(rawValue);
}

/** Категория и название объекта bounds для заголовков в UI. */
export function getBoundsFeatureHeadingParts(layerId, properties = {}) {
  const title = getBoundsFeatureTitle(properties) || "";
  let category = null;

  if (layerId === "oopt_pol") {
    category = formatBoundsPropertyValue({ key: "category_t" }, properties);
  } else if (layerId === "nature_reserve_polygon") {
    category = formatBoundsPropertyValue(
      { key: "BOUNDARY", format: (value) => BOUNDARY_LABELS[value] ?? value },
      properties
    );
  }

  return { category, title };
}

function formatAreaKm2(areaKm2) {
  if (areaKm2 < 0.01) {
    return `${(areaKm2 * 1_000_000).toFixed(0)} м²`;
  }

  if (areaKm2 < 1) {
    return `${(areaKm2 * 100).toFixed(2)} га`;
  }

  return `${areaKm2.toFixed(2)} км²`;
}

/** Площадь объекта bounds для панели сведений (или null, если не удалось определить). */
export function getBoundsFeatureAreaDisplay(layerId, feature) {
  const properties = feature?.properties ?? {};

  if (layerId === "oopt_pol") {
    const hectares = Number(properties.area);
    if (!Number.isFinite(hectares) || hectares <= 0) {
      return null;
    }

    return formatAreaKm2(hectares / 100);
  }

  if (layerId === "nature_reserve_polygon" && feature?.geometry) {
    const areaKm2 = area(feature) / 1_000_000;
    if (!Number.isFinite(areaKm2) || areaKm2 <= 0) {
      return null;
    }

    return formatAreaKm2(areaKm2);
  }

  return null;
}
