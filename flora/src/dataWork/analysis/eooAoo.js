import { area, convex, featureCollection, point } from "@turf/turf";
import { getFeatureLonLat } from "../buildSeasonalityStats";

export const AOO_CELL_KM = 2;

const COORD_PRECISION = 5;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/** Уникальные координаты выборки (схлопывание дублей ~1 м). */
export function collectOccurrenceCoords(features) {
  const seen = new Set();
  const coords = [];

  (Array.isArray(features) ? features : []).forEach((feature) => {
    const lonLat = getFeatureLonLat(feature);
    if (!lonLat) {
      return;
    }
    const key = `${lonLat.lon.toFixed(COORD_PRECISION)},${lonLat.lat.toFixed(COORD_PRECISION)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    coords.push([lonLat.lon, lonLat.lat]);
  });

  return coords;
}

export function aooCellKey(lon, lat, cellKm = AOO_CELL_KM) {
  const latRad = (lat * Math.PI) / 180;
  const kmLon = KM_PER_DEG_LON_EQUATOR * Math.cos(latRad);
  const gx = Math.floor((lon * Math.max(kmLon, 1e-6)) / cellKm);
  const gy = Math.floor((lat * KM_PER_DEG_LAT) / cellKm);
  return `${gx}:${gy}`;
}

/** Area of Occupancy: число занятых ячеек × площадь ячейки. */
export function computeAoo(coords, cellKm = AOO_CELL_KM) {
  const cells = new Set();
  (coords ?? []).forEach(([lon, lat]) => {
    cells.add(aooCellKey(lon, lat, cellKm));
  });
  return {
    cellKm,
    occupiedCells: cells.size,
    areaKm2: cells.size * cellKm * cellKm
  };
}

/** Extent of Occurrence: площадь выпуклой оболочки. IUCN: не менее трёх точек. */
export function computeEoo(coords) {
  const points = coords ?? [];
  if (points.length < 3) {
    return {
      areaKm2: null,
      vertexCount: 0,
      reason: "need_three_points"
    };
  }

  const hull = convex(featureCollection(points.map((coordsPair) => point(coordsPair))));
  if (!hull?.geometry) {
    return {
      areaKm2: null,
      vertexCount: 0,
      reason: "hull_failed"
    };
  }

  const ring = hull.geometry.coordinates?.[0];
  return {
    areaKm2: area(hull) / 1_000_000,
    vertexCount: Array.isArray(ring) ? Math.max(0, ring.length - 1) : 0,
    reason: null
  };
}

export function computeEooAoo(features, { cellKm = AOO_CELL_KM } = {}) {
  const coords = collectOccurrenceCoords(features);
  const eoo = computeEoo(coords);
  const aoo = computeAoo(coords, cellKm);
  return {
    uniqueLocalities: coords.length,
    eoo,
    aoo
  };
}
