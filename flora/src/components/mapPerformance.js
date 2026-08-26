import { gbifRowToSlimFeature } from "../gbif/gbifColumnar";
import { inatRowToSlimFeature } from "../inaturalist/inatColumnar";
import { allRowIndices } from "../externalSources/columnarSnapshot";

/** Порог, после которого включаем упрощённый режим карты. */
export const LARGE_POINT_COUNT_THRESHOLD = 50000;

/** Свойства, достаточные для paint / click / year-filter на карте. */
const MAP_PROPERTY_KEYS = [
  "regnum",
  "found_year",
  "gbif_key",
  "inat_id",
  "id",
  "source",
  "name_latin",
  "name_ru",
  "status",
  "cluster",
  "dense_pile",
  "dense_pile_key",
  "point_count",
  "point_count_abbreviated",
  "coordinates_original"
];

/**
 * Урезает feature для GeoJSONSource.setData: меньше JSON и быстрее Supercluster.
 * Полные свойства остаются в store; popup резолвит по ключу.
 */
export function slimMapFeature(feature) {
  if (!feature?.properties) {
    return feature;
  }

  const props = feature.properties;
  const next = {};
  for (let i = 0; i < MAP_PROPERTY_KEYS.length; i += 1) {
    const key = MAP_PROPERTY_KEYS[i];
    if (props[key] != null && props[key] !== "") {
      next[key] = props[key];
    }
  }

  // Сохраняем числовые clusterProperties для pie-charts, если уже посчитаны.
  for (const key of Object.keys(props)) {
    if (key.startsWith("regnum_") && typeof props[key] === "number") {
      next[key] = props[key];
    }
  }

  if (
    feature.properties === next ||
    Object.keys(next).length === Object.keys(props).length
  ) {
    // Уже тонкий или ничего не отфильтровали — вернём как есть, если все ключи на месте.
    let same = Object.keys(props).length === Object.keys(next).length;
    if (same) {
      for (const key of Object.keys(props)) {
        if (props[key] !== next[key]) {
          same = false;
          break;
        }
      }
    }
    if (same) {
      return feature;
    }
  }

  return {
    ...feature,
    properties: next
  };
}

export function slimMapFeatures(features) {
  if (!Array.isArray(features) || features.length === 0) {
    return features ?? [];
  }
  const out = new Array(features.length);
  for (let i = 0; i < features.length; i += 1) {
    out[i] = slimMapFeature(features[i]);
  }
  return out;
}

export function slimMapFeaturesFromGbifTable(table, rowIndices, getNameRu) {
  const indices = rowIndices ?? allRowIndices(table?.rowCount ?? 0);
  const out = new Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    const rowIndex = indices[i];
    out[i] = gbifRowToSlimFeature(table, rowIndex, {
      nameRu: getNameRu?.(rowIndex) ?? null
    });
  }
  return out;
}

export function slimMapFeaturesFromInatTable(table, rowIndices, getNameRu) {
  const indices = rowIndices ?? allRowIndices(table?.rowCount ?? 0);
  const out = new Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    const rowIndex = indices[i];
    out[i] = inatRowToSlimFeature(table, rowIndex, {
      nameRu: getNameRu?.(rowIndex) ?? null
    });
  }
  return out;
}

/** Координаты-only для heatmap (без лишних properties). */
export function toHeatmapFeatures(features) {
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }
  const out = [];
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      continue;
    }
    out.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [coordinates[0], coordinates[1]]
      },
      properties: {}
    });
  }
  return out;
}

export function isLargePointCount(count) {
  return typeof count === "number" && count >= LARGE_POINT_COUNT_THRESHOLD;
}

/** Порог включения авто-растрового режима (маркеры → тепловая карта, как у iNat). */
export const RASTER_MODE_ENTER_THRESHOLD = 60000;
/** Порог выключения — заметно ниже, чтобы не мигать режимом у границы при фильтрации. */
export const RASTER_MODE_EXIT_THRESHOLD = 40000;

/**
 * Гистерезис для авто-переключения в растровый режим при огромном числе точек:
 * рисовать сотни тысяч маркеров/кластеров — верный путь к Out of Memory,
 * поэтому при превышении порога прячем маркеры и показываем только тепловую карту.
 */
export function resolveAutoRasterMode(count, currentlyActive) {
  if (typeof count !== "number" || Number.isNaN(count)) {
    return Boolean(currentlyActive);
  }
  return currentlyActive
    ? count > RASTER_MODE_EXIT_THRESHOLD
    : count >= RASTER_MODE_ENTER_THRESHOLD;
}

/**
 * Стабильный хэш фильтров локаций (для кэша видимых features).
 * Не зависит от identity объекта.
 */
export function hashLocationFilters(filters = {}) {
  if (!filters || typeof filters !== "object") {
    return "";
  }

  const keys = Object.keys(filters).sort();
  const parts = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = filters[key];
    if (value == null) {
      continue;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        parts.push(`${key}=[${value.map(String).sort().join(",")}]`);
      } else if ("min" in value || "max" in value) {
        parts.push(`${key}={${value.min},${value.max}}`);
      } else {
        parts.push(`${key}=${JSON.stringify(value)}`);
      }
    } else {
      parts.push(`${key}=${String(value)}`);
    }
  }
  return parts.join("|");
}

/** Безопасная конкатенация больших массивов без spread call-stack. */
export function concatFeatures(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (a.length === 0) {
    return b.slice();
  }
  if (b.length === 0) {
    return a.slice();
  }
  const out = new Array(a.length + b.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i];
  }
  for (let j = 0; j < b.length; j += 1) {
    out[a.length + j] = b[j];
  }
  return out;
}

export function appendFeatures(target, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return target;
  }
  for (let i = 0; i < items.length; i += 1) {
    target.push(items[i]);
  }
  return target;
}
