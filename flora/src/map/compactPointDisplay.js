/** Компактная отрисовка локально уже загруженных точек: сетка издалека, точки только в кадре. */

import {
  COMPACT_GRID_POINT_LIMIT_DEFAULT,
  darkenHexColor,
  getCompactGridCellsPerTile,
  shouldUseCompactDensityGrid,
  resolveCompactGridFillColor
} from "./compactGridSettings";

export { COMPACT_GRID_FILL, COMPACT_GRID_STROKE } from "./compactGridSettings";

export const COMPACT_POINT_DETAIL_ZOOM = 11;
export const COMPACT_MAX_VIEWPORT_POINTS = COMPACT_GRID_POINT_LIMIT_DEFAULT;
export const COMPACT_DENSITY_PROP = "compact_density";

const VIEWPORT_PAD = 0.12;
const syncByMap = new WeakMap();

let compactEnabled = false;

export function isCompactPointDisplayEnabled() {
  return compactEnabled;
}

export function setCompactPointDisplayEnabled(enabled) {
  compactEnabled = Boolean(enabled);
}

export function compactGridWorldSize(zoom) {
  const z = Math.max(0, Math.floor(Number(zoom) || 0));
  const extra = Math.log2(getCompactGridCellsPerTile());
  return 2 ** (z + extra);
}

const MERCATOR_MAX_LAT = 85.05112878;

/** Ширина ячейки по долготе у экватора; на карте ячейки квадратные в Web Mercator. */
export function squareDegreesForZoom(zoom) {
  return 360 / compactGridWorldSize(zoom);
}

function clampLat(lat) {
  return Math.min(MERCATOR_MAX_LAT, Math.max(-MERCATOR_MAX_LAT, lat));
}

function lngLatToWorld(lng, lat, worldSize) {
  const x = ((lng + 180) / 360) * worldSize;
  const sinLat = Math.sin((clampLat(lat) * Math.PI) / 180);
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  return [x, y];
}

function worldToLngLat(x, y, worldSize) {
  const lng = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lng, lat];
}

function mercatorCellPolygon(ix, iy, worldSize) {
  const [west, north] = worldToLngLat(ix, iy, worldSize);
  const [east, south] = worldToLngLat(ix + 1, iy + 1, worldSize);
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  };
}

export function paddedBoundsFromMap(map) {
  if (!map?.getBounds) {
    return null;
  }
  const bounds = map.getBounds();
  if (!bounds) {
    return null;
  }
  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  const padX = Math.max(0.01, (east - west) * VIEWPORT_PAD);
  const padY = Math.max(0.01, (north - south) * VIEWPORT_PAD);
  return {
    west: west - padX,
    south: south - padY,
    east: east + padX,
    north: north + padY
  };
}

export function pointInCompactBounds(lng, lat, bounds) {
  if (!bounds || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return false;
  }
  return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

function wrapWorldX(x, worldSize) {
  const wrapped = ((x % worldSize) + worldSize) % worldSize;
  return wrapped;
}

export function compactDensityTrueFilter() {
  return ["boolean", ["get", COMPACT_DENSITY_PROP], false];
}

export function compactDensityFalseFilter() {
  return ["!", compactDensityTrueFilter()];
}

export function compactGridLayerIds(sourceId) {
  return {
    fillId: `${sourceId}-compact-grid-fill`,
    lineId: `${sourceId}-compact-grid-line`
  };
}

export function applyCompactGridLayerPaint(map, sourceId, layerColor) {
  if (!map?.setPaintProperty || !sourceId) {
    return;
  }
  const fill = resolveCompactGridFillColor(layerColor);
  const stroke = darkenHexColor(fill);
  const { fillId, lineId } = compactGridLayerIds(sourceId);
  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, "fill-color", fill);
  }
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-color", stroke);
  }
}

export function applyCompactGridAppearance(map, getLayerColor) {
  const style = map?.getStyle?.();
  if (!style?.layers) {
    return;
  }
  style.layers.forEach((layer) => {
    if (!layer?.id?.endsWith("-compact-grid-fill")) {
      return;
    }
    const sourceId = layer.source;
    const layerColor =
      typeof getLayerColor === "function" ? getLayerColor(sourceId) : undefined;
    applyCompactGridLayerPaint(map, sourceId, layerColor);
  });
}

export function addCompactGridLayers(map, sourceId, layerColor) {
  if (!map?.addLayer || !sourceId) {
    return;
  }
  const { fillId, lineId } = compactGridLayerIds(sourceId);
  const fill = resolveCompactGridFillColor(layerColor);
  const stroke = darkenHexColor(fill);
  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      filter: compactDensityTrueFilter(),
      paint: {
        "fill-color": fill,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["to-number", ["get", "total"]],
          1,
          0.22,
          8,
          0.38,
          40,
          0.52,
          200,
          0.66,
          1000,
          0.78,
          8000,
          0.9
        ]
      }
    });
  }
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      filter: compactDensityTrueFilter(),
      paint: {
        "line-color": stroke,
        "line-width": 0.8,
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["to-number", ["get", "total"]],
          1,
          0.85,
          40,
          0.55,
          8000,
          0.28
        ]
      }
    });
  }
  applyCompactGridLayerPaint(map, sourceId, layerColor);
}

export function buildCompactViewportFeatures({
  map,
  zoom,
  forEachPoint,
  toPointFeature,
  source = "compact"
}) {
  const z = zoom ?? map?.getZoom?.() ?? 0;
  const bounds = paddedBoundsFromMap(map);
  const worldSize = compactGridWorldSize(z);
  const cells = new Map();
  const pointFeatures = [];
  let inBoundsCount = 0;
  const useGrid = shouldUseCompactDensityGrid();
  const wantPoints = Boolean(toPointFeature) && !useGrid;

  if (!bounds || typeof forEachPoint !== "function") {
    return { features: [], mode: "density", inBoundsCount: 0 };
  }

  forEachPoint((lng, lat, extra) => {
    if (!pointInCompactBounds(lng, lat, bounds)) {
      return;
    }
    inBoundsCount += 1;
    if (wantPoints) {
      pointFeatures.push(toPointFeature(extra, lng, lat));
    }
    const [wx, wy] = lngLatToWorld(lng, lat, worldSize);
    const ix = Math.floor(wrapWorldX(wx, worldSize));
    const iy = Math.min(worldSize - 1, Math.max(0, Math.floor(wy)));
    const key = `${ix}:${iy}`;
    let cell = cells.get(key);
    if (!cell) {
      const [centerLng, centerLat] = worldToLngLat(ix + 0.5, iy + 0.5, worldSize);
      cell = {
        ix,
        iy,
        lng: centerLng,
        lat: centerLat,
        total: 0,
        source
      };
      cells.set(key, cell);
    }
    cell.total += 1;
  });

  if (wantPoints) {
    return { features: pointFeatures, mode: "points", inBoundsCount };
  }

  const features = [];
  cells.forEach((cell, key) => {
    features.push({
      type: "Feature",
      id: `compact-${source}-${key}`,
      geometry: mercatorCellPolygon(cell.ix, cell.iy, worldSize),
      properties: {
        [COMPACT_DENSITY_PROP]: true,
        total: cell.total,
        source: cell.source,
        center_lng: cell.lng,
        center_lat: cell.lat
      }
    });
  });
  return { features, mode: "density", inBoundsCount };
}

export function buildCompactViewportFromGeojson(map, features, source = "compact") {
  const list = Array.isArray(features) ? features : [];
  return buildCompactViewportFeatures({
    map,
    source,
    forEachPoint: (visit) => {
      for (let i = 0; i < list.length; i += 1) {
        const feature = list[i];
        const coordinates = feature?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          continue;
        }
        visit(coordinates[0], coordinates[1], feature);
      }
    },
    toPointFeature: (feature) => feature
  });
}

export function compactCircleRadiusExpression(baseRadius = 5) {
  return [
    "case",
    ["boolean", ["get", COMPACT_DENSITY_PROP], false],
    [
      "interpolate",
      ["linear"],
      ["to-number", ["get", "total"]],
      1,
      6,
      20,
      10,
      200,
      16,
      2000,
      22,
      20000,
      30
    ],
    baseRadius
  ];
}

export function isCompactDensityFeature(feature) {
  return Boolean(feature?.properties?.[COMPACT_DENSITY_PROP]);
}

function densityCellCenter(feature) {
  const lng = Number(feature?.properties?.center_lng);
  const lat = Number(feature?.properties?.center_lat);
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    return [lng, lat];
  }
  if (feature?.geometry?.type === "Polygon") {
    const ring = feature.geometry.coordinates?.[0];
    if (Array.isArray(ring) && ring.length >= 4) {
      const [west, south] = ring[0];
      const [east, north] = ring[2];
      return [(west + east) / 2, (south + north) / 2];
    }
  }
  const coordinates = feature?.geometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return coordinates;
  }
  return null;
}

export function easeToCompactDensityCell(map, feature) {
  const center = densityCellCenter(feature);
  if (!map?.easeTo || !center) {
    return;
  }
  map.easeTo({
    center,
    zoom: Math.min((map.getZoom?.() ?? 0) + 2, COMPACT_POINT_DETAIL_ZOOM + 0.4)
  });
}

export function ensureCompactViewportSync(map, key, syncFn) {
  if (!map?.on || typeof syncFn !== "function") {
    return;
  }
  let entry = syncByMap.get(map);
  if (!entry) {
    entry = { fns: new Map(), timer: null };
    const run = () => {
      if (!compactEnabled) {
        return;
      }
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      entry.timer = setTimeout(() => {
        entry.timer = null;
        entry.fns.forEach((fn) => {
          try {
            fn();
          } catch {
            /* ignore */
          }
        });
      }, 80);
    };
    map.on("moveend", run);
    map.on("zoomend", run);
    syncByMap.set(map, entry);
  }
  entry.fns.set(key, syncFn);
}
