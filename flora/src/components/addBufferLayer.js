import { circle, difference, featureCollection, union } from "@turf/turf";

const SOURCE_ID = "buffer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

/**
 * Зоны буфера — от внутренней (красной) к внешней (зелёной).
 * maxDiameterKm первой зоны — 5 км, у каждой следующей на 5 км больше предыдущей.
 */
export const BUFFER_ZONES = [
  { id: "red", label: "Красная зона", color: "#e74c3c", maxDiameterKm: 5 },
  { id: "yellow", label: "Жёлтая зона", color: "#f1c40f", maxDiameterKm: 10 },
  { id: "green", label: "Зелёная зона", color: "#27ae60", maxDiameterKm: 15 }
];

export const BUFFER_MIN_DIAMETER_KM = 0.2;
export const BUFFER_DIAMETER_STEP_KM = 0.1;

/** Диаметры зон по умолчанию (км) — минимально видимый буфер. */
export const DEFAULT_BUFFER_DIAMETERS_KM = BUFFER_ZONES.map(() => BUFFER_MIN_DIAMETER_KM);

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
function unionCircles(centers, radiusKm) {
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
 * Строит кольца буфера вокруг одной или нескольких точек по диаметрам зон (км).
 * Каждая следующая зона — это кольцо между своим и предыдущим радиусом (Turf difference),
 * а не просто круг поверх предыдущего: так цвета зон не смешиваются при наложении.
 */
export function buildBufferRings(centers, diametersKm) {
  const normalizedCenters = normalizeCenters(centers);
  const circles = diametersKm
    .map((diameterKm) => unionCircles(normalizedCenters, Math.max(diameterKm, 0) / 2))
    .filter(Boolean);

  const rings = [];

  circles.forEach((circleFeature, index) => {
    const zone = BUFFER_ZONES[index];
    const ringGeometry =
      index === 0
        ? circleFeature
        : difference(featureCollection([circleFeature, circles[index - 1]]));

    if (!ringGeometry) {
      // Диаметр зоны равен (или меньше) диаметру предыдущей — кольцо нулевой ширины.
      return;
    }

    rings.push({
      ...ringGeometry,
      properties: {
        color: zone.color,
        zoneId: zone.id,
        zoneLabel: zone.label,
        diameterKm: diametersKm[index]
      }
    });
  });

  return rings;
}

/** Рисует буфер вокруг одной или нескольких точек и возвращает сводку для панели. */
export function updateBufferLayer(map, features, diametersKm) {
  const source = map.getSource(SOURCE_ID);
  const featureList = Array.isArray(features) ? features : features ? [features] : [];
  const centers = featureList
    .map((feature) => feature?.geometry?.coordinates)
    .filter(Boolean);

  if (!source || !centers.length) {
    return { built: false };
  }

  const rings = buildBufferRings(centers, diametersKm);

  source.setData({
    type: "FeatureCollection",
    features: rings
  });

  return {
    built: rings.length > 0,
    diametersKm: [...diametersKm]
  };
}

/** Очищает слой буфера на карте. */
export function clearBufferLayer(map) {
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}
