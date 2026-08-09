import { destination, point } from "@turf/turf";

/** Свойство с исходными координатами до разведения совпадающих точек. */
export const COORDINATES_ORIGINAL_PROP = "coordinates_original";

/** Шаг спирали в метрах: радиус ≈ BASE * sqrt(index). */
export const SPREAD_BASE_METERS = 10;

/** Золотой угол — равномерная спираль без наложений. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function coordKey(lng, lat) {
  return `${lng},${lat}`;
}

/** Координаты точки: исходные, если были разведены, иначе geometry. */
export function getFeatureCoordinates(feature) {
  const original = feature?.properties?.[COORDINATES_ORIGINAL_PROP];

  if (Array.isArray(original) && original.length >= 2) {
    const lng = Number(original[0]);
    const lat = Number(original[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  return [coordinates[0], coordinates[1]];
}

/** Возвращает копию feature с geometry на исходных координатах. */
export function restoreOriginalCoordinates(feature) {
  if (!feature?.properties?.[COORDINATES_ORIGINAL_PROP]) {
    return feature;
  }

  const coordinates = getFeatureCoordinates(feature);
  if (!coordinates) {
    return feature;
  }

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      type: "Point",
      coordinates
    }
  };
}

function offsetCoordinate(lng, lat, index) {
  if (index <= 0) {
    return [lng, lat];
  }

  const bearing = ((index * GOLDEN_ANGLE) * 180) / Math.PI;
  const distanceKm = (SPREAD_BASE_METERS * Math.sqrt(index)) / 1000;
  const moved = destination(point([lng, lat]), distanceKm, bearing, {
    units: "kilometers"
  });

  return moved.geometry.coordinates;
}

/**
 * Разводит точки с одинаковыми координатами по спирали вокруг исходной позиции.
 * Первая точка группы остаётся на месте; остальные получают coordinates_original.
 * Не мутирует входной массив и его элементы.
 */
export function spreadCoincidentFeatures(features) {
  if (!Array.isArray(features) || features.length < 2) {
    return features ?? [];
  }

  const groups = new Map();

  features.forEach((feature, index) => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return;
    }

    // Если точка уже разведена, группируем по исходным координатам.
    const [lng, lat] = getFeatureCoordinates(feature) ?? coordinates;
    const key = coordKey(lng, lat);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(index);
  });

  const result = features.slice();

  groups.forEach((indices) => {
    if (indices.length < 2) {
      return;
    }

    const baseFeature = features[indices[0]];
    const [baseLng, baseLat] = getFeatureCoordinates(baseFeature) ??
      baseFeature.geometry.coordinates;

    indices.forEach((featureIndex, groupIndex) => {
      const feature = features[featureIndex];
      const original =
        getFeatureCoordinates(feature) ?? feature.geometry.coordinates;
      const nextCoordinates = offsetCoordinate(baseLng, baseLat, groupIndex);

      result[featureIndex] = {
        ...feature,
        geometry: {
          ...feature.geometry,
          type: "Point",
          coordinates: nextCoordinates
        },
        properties: {
          ...feature.properties,
          [COORDINATES_ORIGINAL_PROP]: original
        }
      };
    });
  });

  return result;
}

/**
 * Границы [[west,south],[east,north]] для разведённой кучи,
 * чтобы fitBounds показал все точки спирали.
 */
export function getSpreadPileFitBounds(coordinates, pointCount) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const count = Math.max(Number(pointCount) || 1, 1);
  const radiusMeters = SPREAD_BASE_METERS * Math.sqrt(Math.max(count - 1, 0));
  const paddingMeters = Math.max(radiusMeters * 1.35, 25);
  const latPad = paddingMeters / 111320;
  const lngPad = paddingMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));

  return [
    [lng - lngPad, lat - latPad],
    [lng + lngPad, lat + latPad]
  ];
}
