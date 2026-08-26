import { bbox as turfBbox, simplify } from "@turf/turf";
import { getRegionSelectionWithinFeature } from "../components/addRegionBoundsLayer";

function roundCoord(value) {
  return Number(Number(value).toFixed(4));
}

function ringToWkt(ring) {
  const positions = Array.isArray(ring) ? ring : [];
  // WKT-полигоны обязаны быть замкнуты (первая точка = последней),
  // иначе GBIF может отклонить или неверно интерпретировать геометрию.
  const first = positions[0];
  const last = positions[positions.length - 1];
  const closed =
    first && last && (first[0] !== last[0] || first[1] !== last[1])
      ? [...positions, first]
      : positions;
  return `(${closed.map((position) => `${roundCoord(position[0])} ${roundCoord(position[1])}`).join(",")})`;
}

function polygonToWkt(rings) {
  return `(${(rings ?? []).map(ringToWkt).join(",")})`;
}

function geojsonToWkt(feature) {
  const geometry = feature?.geometry;
  if (!geometry) {
    return "";
  }
  if (geometry.type === "Polygon") {
    return `POLYGON${polygonToWkt(geometry.coordinates)}`;
  }
  if (geometry.type === "MultiPolygon") {
    const parts = (geometry.coordinates ?? []).map(polygonToWkt).join(",");
    return `MULTIPOLYGON(${parts})`;
  }
  return "";
}

function compactGeometry(feature) {
  if (!feature?.geometry) {
    return feature;
  }
  try {
    return simplify(feature, { tolerance: 0.02, highQuality: false, mutate: false });
  } catch {
    return feature;
  }
}

const MAX_WKT_CHARS = 7000;

/**
 * Подменяет административный фильтр (GADM / place_id) геометрией буфера.
 * GBIF: WKT-полигон; iNaturalist: охватывающий bbox (полигон API не принимает).
 */
export function applyBufferToExternalRegion(region, feature, bufferKm) {
  const radius = Number(bufferKm);
  if (!region || !feature?.geometry || !Number.isFinite(radius) || radius <= 0) {
    // Буфер не запрошен или не может быть построен — явно сообщаем об этом
    // вызывающему коду, а не молча возвращаем region как есть (чтобы UI не
    // считал загрузку буферизованной, когда это не так).
    return null;
  }

  const expanded = getRegionSelectionWithinFeature([feature], radius);
  if (!expanded?.geometry) {
    return null;
  }

  const compact = compactGeometry(expanded);
  let geometry = geojsonToWkt(compact);
  const bounds = turfBbox(compact);
  if (!Array.isArray(bounds) || bounds.length < 4) {
    return null;
  }

  if (!geometry || geometry.length > MAX_WKT_CHARS) {
    geometry = "";
  }

  return {
    ...region,
    gbif: geometry
      ? { geometry }
      : { bbox: bounds },
    inaturalist: { bbox: bounds }
  };
}

export function withLoadSpatialOverride(region, spatialByRegionId) {
  if (!region?.id || !spatialByRegionId) {
    return region;
  }
  return spatialByRegionId[region.id] || region;
}
