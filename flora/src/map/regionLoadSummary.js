import { matchMapRegionToExternal } from "../externalSources/matchMapRegionToExternal";
import { getExternalRegionById } from "../externalSources/regions";
import { countGbifFeaturesByRegionId, getGbifLoadedRegionIds } from "../gbif/gbifStore";
import { countInatFeaturesByRegionId, getInatLoadedRegionIds } from "../inaturalist/inatStore";
import {
  isRegionTempLayer,
  listTempLayerPlaques,
  normalizeTempSource,
  resolveTempSourceMarkerColor,
  TEMP_SOURCE_IDS
} from "../tempLayers/tempLayerStore";

let summaryActive = false;
let summaryMode = "external";
let pointMarkersRequested = false;

export function isRegionLoadSummaryActive() {
  return summaryActive;
}

export function setRegionLoadSummaryActive(active) {
  summaryActive = Boolean(active);
}

export function setRegionLoadSummaryMode(mode) {
  summaryMode = mode === "temp" ? "temp" : "external";
}

export function setLoadedPointMarkersRequested(requested) {
  pointMarkersRequested = Boolean(requested);
}

export function areLoadedPointMarkersRequested() {
  return pointMarkersRequested;
}

function areAnyTempPointLayersVisible() {
  return listTempLayerPlaques().some((plaque) =>
    (plaque.layers || []).some(
      (layer) =>
        layer.visible &&
        !isRegionTempLayer(layer) &&
        (layer.features?.length || 0) > 0
    )
  );
}

/** Точки на карте скрыты, пока пользователь явно не включит отображение. */
export function shouldSuppressLoadedPointLayers() {
  if (summaryMode === "temp") {
    return summaryActive && !areAnyTempPointLayersVisible();
  }
  return summaryActive && !pointMarkersRequested;
}

function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function ringCentroid(ring) {
  let cx = 0;
  let cy = 0;
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    twiceArea += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (!twiceArea) {
    return ring[0] ?? null;
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

function polygonsFromGeometry(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  return [];
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonCoords(point, polygon) {
  const outer = polygon[0];
  if (!outer || !pointInRing(point, outer)) {
    return false;
  }
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) {
      return false;
    }
  }
  return true;
}

function polygonAreaCentroid(polygon) {
  let cx = 0;
  let cy = 0;
  let totalArea = 0;
  for (let r = 0; r < polygon.length; r += 1) {
    const ring = polygon[r];
    const centroid = ringCentroid(ring);
    const area = ringSignedArea(ring);
    if (!centroid || !area) {
      continue;
    }
    cx += centroid[0] * area;
    cy += centroid[1] * area;
    totalArea += area;
  }
  if (!totalArea) {
    return polygon[0]?.[0] ?? null;
  }
  return [cx / totalArea, cy / totalArea];
}

function unwrapRingLongitudes(ring) {
  if (!ring.length) {
    return ring;
  }
  const unwrapped = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i += 1) {
    let lng = ring[i][0];
    const prev = unwrapped[i - 1][0];
    while (lng - prev > 180) {
      lng -= 360;
    }
    while (lng - prev < -180) {
      lng += 360;
    }
    unwrapped.push([lng, ring[i][1]]);
  }
  return unwrapped;
}

function ringBounds(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const x = ring[i][0];
    const y = ring[i][1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Ближайшая точка внутри полигона к целевой (если центроид выпал наружу). */
function nearestInteriorPoint(target, polygon) {
  const ring = polygon[0];
  if (!ring) {
    return null;
  }
  const { minX, minY, maxX, maxY } = ringBounds(ring);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0 && height > 0)) {
    return ring[0] ?? null;
  }

  let best = null;
  let bestDist = Infinity;
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const x = minX + (width * i) / steps;
      const y = minY + (height * j) / steps;
      if (!pointInPolygonCoords([x, y], polygon)) {
        continue;
      }
      const dist = (x - target[0]) ** 2 + (y - target[1]) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = [x, y];
      }
    }
  }
  return best;
}

function largestPolygon(geometry) {
  const polygons = polygonsFromGeometry(geometry);
  if (polygons.length === 0) {
    return null;
  }
  let best = polygons[0];
  let bestArea = Math.abs(ringSignedArea(best[0] || []));
  for (let i = 1; i < polygons.length; i += 1) {
    const area = Math.abs(ringSignedArea(polygons[i][0] || []));
    if (area > bestArea) {
      best = polygons[i];
      bestArea = area;
    }
  }
  return best;
}

/**
 * Геометрический центр: середина охватывающего прямоугольника.
 * Если она вне полигона — ближайшая точка внутри.
 */
function geometricCenter(polygon) {
  const ring = polygon[0];
  if (!ring || ring.length < 3) {
    return null;
  }

  const unwrapped = unwrapRingLongitudes(ring);
  const working =
    unwrapped === ring
      ? polygon
      : [unwrapped, ...polygon.slice(1)];
  const { minX, minY, maxX, maxY } = ringBounds(unwrapped);
  const bboxCenter = [(minX + maxX) / 2, (minY + maxY) / 2];
  if (pointInPolygonCoords(bboxCenter, working)) {
    return bboxCenter;
  }

  const mass = polygonAreaCentroid(working);
  if (mass && pointInPolygonCoords(mass, working)) {
    return mass;
  }

  return nearestInteriorPoint(bboxCenter, working) || unwrapped[0] || null;
}

export function regionLabelPlacement(feature) {
  const polygon = largestPolygon(feature?.geometry);
  const ring = polygon?.[0];
  if (!ring) {
    return null;
  }
  const coordinates = geometricCenter(polygon);
  if (!coordinates) {
    return null;
  }
  return {
    coordinates,
    bounds: ringBounds(unwrapRingLongitudes(ring))
  };
}

/** Точка подписи в геометрическом центре крупнейшей части субъекта. */
export function regionLabelCoordinates(feature) {
  return regionLabelPlacement(feature)?.coordinates ?? null;
}

export const REGION_PLAQUE_COMPACT_SPAN_PX = 110;

export function isRegionPlaqueCompact(bounds, projectPoint) {
  if (!bounds || typeof projectPoint !== "function") {
    return false;
  }
  const southWest = projectPoint([bounds.minX, bounds.minY]);
  const northEast = projectPoint([bounds.maxX, bounds.maxY]);
  if (!southWest || !northEast) {
    return false;
  }
  const span = Math.min(
    Math.abs(northEast.x - southWest.x),
    Math.abs(northEast.y - southWest.y)
  );
  return span < REGION_PLAQUE_COMPACT_SPAN_PX;
}

export function formatCompactPointCount(value) {
  const count = Number(value) || 0;
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(".0", "")}M`;
  }
  if (count >= 10_000) {
    return `${Math.round(count / 1000)}k`;
  }
  return formatPointCount(count);
}

/** CSS-переменные плашки — те же, что у временного слоя в панели. */
export function regionPlaqueColorVars(summary) {
  const base = summary?.markerColor || null;
  const vars = {
    "--temp-layer-color-gbif": resolveTempSourceMarkerColor(base, TEMP_SOURCE_IDS.GBIF),
    "--temp-layer-color-inat": resolveTempSourceMarkerColor(base, TEMP_SOURCE_IDS.INAT)
  };
  if (base) {
    vars["--temp-layer-color"] = base;
  }
  return vars;
}

export function buildExternalIdToCatalogEntry(catalog = []) {
  const map = new Map();
  catalog.forEach((entry) => {
    const region = matchMapRegionToExternal(entry);
    if (region?.id && !map.has(region.id)) {
      map.set(region.id, entry);
    }
  });
  return map;
}

function formatPointCount(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function collectLayerRegionIds(layer) {
  const ids = new Set();
  (layer?.regionIds || []).forEach((id) => {
    if (id) {
      ids.add(String(id));
    }
  });
  (layer?.features || []).forEach((feature) => {
    const regionId = feature?.properties?.region_id;
    if (regionId) {
      ids.add(String(regionId));
    }
  });
  return ids;
}

function countLayerPointsForRegion(layer, regionId) {
  const features = Array.isArray(layer?.features) ? layer.features : [];
  const ids = [...collectLayerRegionIds(layer)];
  if (!ids.includes(regionId)) {
    return 0;
  }
  if (ids.length <= 1) {
    return features.length;
  }
  const tagged = features.filter(
    (feature) => String(feature?.properties?.region_id || "") === regionId
  ).length;
  return tagged > 0 ? tagged : 0;
}

/**
 * Плашки временных слоёв: по одному маркеру на регион каждого слоя.
 */
export function buildTempLayerRegionSummaries({ catalog = [], plaques } = {}) {
  const catalogByExternalId = buildExternalIdToCatalogEntry(catalog);
  const list = Array.isArray(plaques) ? plaques : listTempLayerPlaques();
  const summaries = [];

  list.forEach((plaque) => {
    const pointLayers = (plaque.layers || []).filter(
      (layer) => !isRegionTempLayer(layer) && (layer.features?.length || 0) > 0
    );
    if (pointLayers.length === 0) {
      return;
    }

    const regionIds = new Set();
    pointLayers.forEach((layer) => {
      collectLayerRegionIds(layer).forEach((id) => regionIds.add(id));
    });
    if (regionIds.size === 0) {
      return;
    }

    const layerName = String(plaque.taxonName || plaque.label || "Временный слой").trim();
    const hasGbif = pointLayers.some(
      (layer) => normalizeTempSource(layer.source) === TEMP_SOURCE_IDS.GBIF
    );
    const hasInat = pointLayers.some(
      (layer) => normalizeTempSource(layer.source) === TEMP_SOURCE_IDS.INAT
    );
    const hasMap = pointLayers.some(
      (layer) => normalizeTempSource(layer.source) === TEMP_SOURCE_IDS.MAP
    );

    regionIds.forEach((regionId) => {
      const pointCount = pointLayers.reduce(
        (sum, layer) => sum + countLayerPointsForRegion(layer, regionId),
        0
      );
      if (pointCount <= 0) {
        return;
      }
      const entry = catalogByExternalId.get(regionId);
      const placement = regionLabelPlacement(entry?.feature);
      if (!placement) {
        return;
      }
      summaries.push({
        id: `${plaque.key}::${regionId}`,
        regionId,
        layerIds: pointLayers.map((layer) => layer.id),
        plaqueKey: plaque.key,
        displayOn: pointLayers.some((layer) => layer.visible),
        layerName,
        label: getExternalRegionById(regionId)?.label || entry?.name || regionId,
        coordinates: placement.coordinates,
        bounds: placement.bounds,
        markerColor: plaque.markerColor || null,
        pointCount,
        pointCountLabel: formatPointCount(pointCount),
        sources: {
          gbif: hasGbif,
          inat: hasInat,
          map: hasMap
        }
      });
    });
  });

  return summaries.sort((a, b) => {
    const byRegion = a.label.localeCompare(b.label, "ru");
    if (byRegion !== 0) {
      return byRegion;
    }
    return a.layerName.localeCompare(b.layerName, "ru");
  });
}

/**
 * Сводка по регионам, где есть загруженные GBIF/iNat точки.
 * @param {{
 *   catalog?: Array,
 *   includeGbif?: boolean,
 *   includeInat?: boolean,
 *   hiddenRegionIds?: string[]
 * }} [options]
 */
export function buildRegionLoadSummaries({
  catalog = [],
  includeGbif = true,
  includeInat = true,
  hiddenRegionIds = []
} = {}) {
  const hidden = new Set((hiddenRegionIds ?? []).map((id) => String(id)).filter(Boolean));
  const catalogByExternalId = buildExternalIdToCatalogEntry(catalog);
  const gbifCounts = includeGbif ? countGbifFeaturesByRegionId() : new Map();
  const inatCounts = includeInat ? countInatFeaturesByRegionId() : new Map();
  const regionIds = new Set();

  if (includeGbif) {
    getGbifLoadedRegionIds().forEach((id) => regionIds.add(String(id)));
    gbifCounts.forEach((_, id) => regionIds.add(id));
  }
  if (includeInat) {
    getInatLoadedRegionIds().forEach((id) => regionIds.add(String(id)));
    inatCounts.forEach((_, id) => regionIds.add(id));
  }

  const summaries = [];

  regionIds.forEach((regionId) => {
    if (hidden.has(regionId)) {
      return;
    }

    const gbifCount = gbifCounts.get(regionId) || 0;
    const inatCount = inatCounts.get(regionId) || 0;
    const pointCount = gbifCount + inatCount;
    if (pointCount <= 0) {
      return;
    }

    const entry = catalogByExternalId.get(regionId);
    const placement = regionLabelPlacement(entry?.feature);
    if (!placement) {
      return;
    }

    const region = getExternalRegionById(regionId);
    summaries.push({
      id: regionId,
      regionId,
      layerName: "",
      displayOn: areLoadedPointMarkersRequested(),
      label: region?.label || entry?.name || regionId,
      coordinates: placement.coordinates,
      bounds: placement.bounds,
      markerColor: null,
      pointCount,
      pointCountLabel: formatPointCount(pointCount),
      sources: {
        gbif: gbifCount > 0,
        inat: inatCount > 0
      }
    });
  });

  return summaries.sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
