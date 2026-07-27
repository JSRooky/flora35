import { circle, difference, featureCollection } from "@turf/turf";

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

/**
 * Строит кольца буфера вокруг точки по диаметрам зон (км, в порядке BUFFER_ZONES).
 * Каждая следующая зона — это кольцо между своим и предыдущим радиусом (Turf difference),
 * а не просто круг поверх предыдущего: так цвета зон не смешиваются при наложении.
 */
export function buildBufferRings(center, diametersKm) {
  const circles = diametersKm.map((diameterKm) =>
    circle(center, Math.max(diameterKm, 0) / 2, { units: "kilometers", steps: 64 })
  );

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

/** Рисует буфер вокруг точки и возвращает сводку для панели модуля. */
export function updateBufferLayer(map, feature, diametersKm) {
  const source = map.getSource(SOURCE_ID);
  const center = feature?.geometry?.coordinates;

  if (!source || !center) {
    return { built: false };
  }

  const rings = buildBufferRings(center, diametersKm);

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
