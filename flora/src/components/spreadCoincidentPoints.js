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
 * Ключи lng,lat, где в наборе ≥2 точек с полностью одинаковыми координатами.
 */
export function getCoincidentCoordKeys(features) {
  const counts = new Map();

  (features ?? []).forEach((feature) => {
    const coordinates = getFeatureCoordinates(feature);
    if (!coordinates) {
      return;
    }

    const key = coordKey(coordinates[0], coordinates[1]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const coincident = new Set();
  counts.forEach((count, key) => {
    if (count >= 2) {
      coincident.add(key);
    }
  });

  return coincident;
}

/**
 * Самая крупная группа совпадающих координат среди features.
 * @returns {{ key: string, coordinates: [number, number], pointCount: number } | null}
 */
export function getLargestCoincidentGroup(features) {
  const groups = new Map();

  (features ?? []).forEach((feature) => {
    const coordinates = getFeatureCoordinates(feature);
    if (!coordinates) {
      return;
    }

    const key = coordKey(coordinates[0], coordinates[1]);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        coordinates: [coordinates[0], coordinates[1]],
        pointCount: 0
      });
    }
    groups.get(key).pointCount += 1;
  });

  let largest = null;
  groups.forEach((group) => {
    if (group.pointCount < 2) {
      return;
    }
    if (!largest || group.pointCount > largest.pointCount) {
      largest = group;
    }
  });

  return largest;
}

/**
 * Разводит точки с одинаковыми координатами по спирали вокруг исходной позиции.
 * Первая точка группы остаётся на месте; остальные получают coordinates_original.
 * Не мутирует входной массив и его элементы.
 *
 * @param {object[]} features
 * @param {Set<string>|null} [onlyKeys] — если задан, разводить только эти ключи lng,lat;
 *   пустой Set = не разводить ничего; null/undefined = все группы ≥2.
 */
export function spreadCoincidentFeatures(features, onlyKeys = null) {
  if (!Array.isArray(features) || features.length < 2) {
    return features ?? [];
  }

  if (onlyKeys && onlyKeys.size === 0) {
    return features;
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

  groups.forEach((indices, key) => {
    if (indices.length < 2) {
      return;
    }

    if (onlyKeys && !onlyKeys.has(key)) {
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

/**
 * Зумирует карту к самой крупной группе совпадающих координат (после spread).
 * @returns {boolean} true, если камера сдвинута
 */
export function fitMapToCoincidentSpread(map, features) {
  if (!map) {
    return false;
  }

  const largest = getLargestCoincidentGroup(features);
  if (!largest) {
    return false;
  }

  const bounds = getSpreadPileFitBounds(largest.coordinates, largest.pointCount);
  if (bounds && largest.pointCount > 1) {
    map.fitBounds(bounds, {
      padding: 56,
      maxZoom: 18,
      duration: 900
    });
  } else {
    map.easeTo({
      center: largest.coordinates,
      zoom: Math.max(map.getZoom(), 15)
    });
  }

  return true;
}
