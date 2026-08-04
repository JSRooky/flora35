import { circle, difference, featureCollection, union } from "@turf/turf";

const SOURCE_ID = "buffer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

/**
 * Зоны буфера — от внутренней (зелёной) к внешней (серой).
 * maxRadiusKm первой зоны — 5 км, у каждой следующей на 5 км больше предыдущей.
 */
export const BUFFER_ZONES = [
  { id: "inner", label: "Внутренняя зона", color: "#27ae60", probabilityLabel: "высокая", maxRadiusKm: 5 },
  { id: "middle", label: "Средняя зона", color: "#8fa8bc", probabilityLabel: "средняя", maxRadiusKm: 10 },
  { id: "outer", label: "Внешняя зона", color: "#9aa0a6", probabilityLabel: "низкая", maxRadiusKm: 15 }
];

export const BUFFER_MIN_RADIUS_KM = 0.1;
export const BUFFER_RADIUS_STEP_KM = 0.1;

/** Радиусы зон по умолчанию (км) — минимально видимый буфер. */
export const DEFAULT_BUFFER_RADII_KM = BUFFER_ZONES.map(() => BUFFER_MIN_RADIUS_KM);

/** Добавляет на карту слой заливки и контура буфера (изначально пустой). */
export function addBufferLayer(map) {
  if (map.getSource(SOURCE_ID)) {
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: "buffer-fill",
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.35
    }
  });

  map.addLayer({
    id: "buffer-outline",
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1.5
    }
  });
}

/** Объединяет окружности одного радиуса вокруг нескольких центров. */
export function unionCircles(centers, radiusKm) {
  if (!centers.length) {
    return null;
  }

  let result = circle(centers[0], radiusKm, { units: "kilometers", steps: 64 });

  for (let index = 1; index < centers.length; index++) {
    const nextCircle = circle(centers[index], radiusKm, {
      units: "kilometers",
      steps: 64
    });
    result = union(featureCollection([result, nextCircle]));
  }

  return result;
}

function normalizeCenters(centers) {
  if (!centers) {
    return [];
  }

  if (Array.isArray(centers[0])) {
    return centers;
  }

  return [centers];
}

/**
 * Строит кольца буфера вокруг одной или нескольких точек по радиусам зон (км).
 * Каждая следующая зона — это кольцо между своим и предыдущим радиусом (Turf difference),
 * а не просто круг поверх предыдущего: так цвета зон не смешиваются при наложении.
 */
export function buildBufferRings(centers, radiiKm) {
  const normalizedCenters = normalizeCenters(centers);
  const safeRadiiKm = BUFFER_ZONES.map((zone, index) => {
    const value = radiiKm?.[index];
    const radiusKm =
      typeof value === "number" && !Number.isNaN(value) ? value : BUFFER_MIN_RADIUS_KM;

    return Math.min(Math.max(radiusKm, 0), zone.maxRadiusKm);
  });
  const circles = safeRadiiKm
    .map((radiusKm) => unionCircles(normalizedCenters, radiusKm))
    .filter(Boolean);

  const rings = [];

  circles.forEach((circleFeature, index) => {
    const zone = BUFFER_ZONES[index];
    const ringGeometry =
      index === 0
        ? circleFeature
        : difference(featureCollection([circleFeature, circles[index - 1]]));

    if (!ringGeometry) {
      // Радиус зоны равен (или меньше) радиуса предыдущей — кольцо нулевой ширины.
      return;
    }

    rings.push({
      ...ringGeometry,
      properties: {
        color: zone.color,
        zoneId: zone.id,
        zoneLabel: zone.label,
        radiusKm: safeRadiiKm[index]
      }
    });
  });

  return rings;
}

/** Рисует буфер вокруг одной или нескольких точек и возвращает сводку для панели. */
export function updateBufferLayer(map, features, radiiKm) {
  const source = map.getSource(SOURCE_ID);
  const featureList = Array.isArray(features) ? features : features ? [features] : [];
  const centers = featureList
    .map((feature) => feature?.geometry?.coordinates)
    .filter(Boolean);

  if (!source || !centers.length) {
    return { built: false };
  }

  const rings = buildBufferRings(centers, radiiKm);

  source.setData({
    type: "FeatureCollection",
    features: rings
  });

  return {
    built: rings.length > 0,
    radiiKm: [...radiiKm]
  };
}

/** Возвращает внешнюю границу буфера (объединение окружностей максимального радиуса). */
export function getBufferOuterFeature(features, radiiKm) {
  const featureList = Array.isArray(features) ? features : features ? [features] : [];
  const centers = featureList.map((feature) => feature?.geometry?.coordinates).filter(Boolean);

  if (!centers.length) {
    return null;
  }

  const outerRadiusKm = radiiKm?.[radiiKm.length - 1];
  const radiusKm =
    typeof outerRadiusKm === "number" && !Number.isNaN(outerRadiusKm)
      ? outerRadiusKm
      : BUFFER_MIN_RADIUS_KM;

  return unionCircles(centers, radiusKm);
}

/** Очищает слой буфера на карте. */
export function clearBufferLayer(map) {
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}
