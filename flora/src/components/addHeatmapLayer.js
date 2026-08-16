import { filterFeatures, getFirstLocationsLayerId, getToolFeatures } from "./addLocationsLayer";
import { TEMP_LAYERS_LAYER_ID } from "./addTempLayersLayer";
import {
  buildHeatmapPaint,
  createDefaultHeatmapSettings,
  hexToRgba
} from "./heatmapSettings";
import { toHeatmapFeatures } from "./mapPerformance";
import { DEFAULT_POINT_COLOR } from "./pointColors";
import { getTempLayers, resolveTempSourceMarkerColor } from "../tempLayers/tempLayerStore";

const SOURCE_ID = "heatmap";
const LAYER_ID = "heatmap";
const TEMP_HEATMAP_SOURCE_PREFIX = "heatmap-temp-src-";
const TEMP_HEATMAP_LAYER_PREFIX = "heatmap-temp-";

let heatmapPaintSettings = createDefaultHeatmapSettings();

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let heatmapSourceOptions = {
  tempLayersOnly: false,
  excludeLayerIds: []
};

/** Режим данных общей тепловой карты: все точки инструментов или только временные слои. */
export function setHeatmapSourceOptions({ tempLayersOnly = false, excludeLayerIds = [] } = {}) {
  heatmapSourceOptions = {
    tempLayersOnly: Boolean(tempLayersOnly),
    excludeLayerIds: Array.isArray(excludeLayerIds) ? excludeLayerIds : []
  };
}

export function refreshHeatmapSourceOptions(tempLayersOnly) {
  setHeatmapSourceOptions({
    tempLayersOnly,
    excludeLayerIds: getTempLayers()
      .filter((layer) => layer.heatmapEnabled)
      .map((layer) => layer.id)
  });
}

function heatmapColorForLayer(markerColor) {
  if (!markerColor) {
    return buildHeatmapPaint(heatmapPaintSettings)["heatmap-color"];
  }
  return [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    "rgba(0,0,0,0)",
    0.15,
    hexToRgba(markerColor, 0.15),
    0.4,
    hexToRgba(markerColor, 0.45),
    0.7,
    hexToRgba(markerColor, 0.75),
    1,
    markerColor
  ];
}

function collectionFromFeatures(features) {
  return {
    type: "FeatureCollection",
    features: toHeatmapFeatures(features)
  };
}

function getCombinedHeatmapFeatures(filters = {}) {
  if (!heatmapSourceOptions.tempLayersOnly) {
    return getToolFeatures(filters);
  }

  const exclude = new Set(heatmapSourceOptions.excludeLayerIds);
  const features = [];
  getTempLayers().forEach((layer) => {
    if (!layer.visible || exclude.has(layer.id) || !Array.isArray(layer.features)) {
      return;
    }
    for (let index = 0; index < layer.features.length; index += 1) {
      features.push(layer.features[index]);
    }
  });
  return filterFeatures(features, filters);
}

/** Формирует GeoJSON для тепловой карты (только координаты). */
function buildHeatmapData(filters = {}) {
  return collectionFromFeatures(getCombinedHeatmapFeatures(filters));
}

function getHeatmapBeforeId(map) {
  if (map.getLayer(TEMP_LAYERS_LAYER_ID)) {
    return TEMP_LAYERS_LAYER_ID;
  }
  return getFirstLocationsLayerId(map);
}

function heatmapPaint(colorExpression) {
  return buildHeatmapPaint(heatmapPaintSettings, colorExpression);
}

function applyPaintToLayer(map, layerId, colorExpression) {
  if (!map.getLayer(layerId)) {
    return;
  }
  const paint = heatmapPaint(colorExpression);
  Object.entries(paint).forEach(([property, value]) => {
    map.setPaintProperty(layerId, property, value);
  });
  const minzoom = Math.max(0, Number(heatmapPaintSettings.minzoom) || 0);
  const maxzoom = Math.max(minzoom, Number(heatmapPaintSettings.maxzoom) || 22);
  if (typeof map.setLayerZoomRange === "function") {
    map.setLayerZoomRange(layerId, minzoom, maxzoom);
  }
}

/** Применяет настройки heatmap ко всем тепловым слоям на карте. */
export function applyHeatmapPaintSettings(map, settings = heatmapPaintSettings) {
  heatmapPaintSettings = { ...createDefaultHeatmapSettings(), ...settings };
  if (!map?.getLayer) {
    return;
  }
  applyPaintToLayer(map, LAYER_ID);
  listTempHeatmapLayerIds(map).forEach((mapLayerId) => {
    const sourceLayer = map.getLayer(mapLayerId);
    const currentColor = sourceLayer ? map.getPaintProperty(mapLayerId, "heatmap-color") : null;
    applyPaintToLayer(map, mapLayerId, currentColor);
  });
}

/** Добавляет слой тепловой карты под маркерами (по умолчанию скрыт). */
export function addHeatmapLayer(map) {
  if (map.getSource(SOURCE_ID)) {
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer(
    {
      id: LAYER_ID,
      type: "heatmap",
      source: SOURCE_ID,
      layout: {
        visibility: "none"
      },
      paint: heatmapPaint()
    },
    getHeatmapBeforeId(map)
  );
  applyPaintToLayer(map, LAYER_ID);
}

/** Включает/выключает тепловую карту и обновляет её данные при включении. */
export function setHeatmapEnabled(map, enabled, filters = {}) {
  if (!map.getLayer(LAYER_ID)) {
    addHeatmapLayer(map);
  }

  const source = map.getSource(SOURCE_ID);
  if (source && enabled) {
    source.setData(buildHeatmapData(filters));
  }

  map.setLayoutProperty(LAYER_ID, "visibility", enabled ? "visible" : "none");
}

/** Обновляет данные тепловой карты по фильтрам, только если слой сейчас видим. */
export function updateHeatmapData(map, filters = {}) {
  if (!map.getLayer(LAYER_ID)) {
    return;
  }

  if (map.getLayoutProperty(LAYER_ID, "visibility") === "none") {
    return;
  }

  const source = map.getSource(SOURCE_ID);
  if (source) {
    source.setData(buildHeatmapData(filters));
  }
}

/** Временно подменяет данные тепловой карты заданным набором точек. */
export function setHeatmapFeatures(map, features = []) {
  if (!map?.getSource?.(SOURCE_ID)) {
    return;
  }

  map.getSource(SOURCE_ID).setData(collectionFromFeatures(Array.isArray(features) ? features : []));
}

function tempHeatmapIds(layerId) {
  return {
    sourceId: `${TEMP_HEATMAP_SOURCE_PREFIX}${layerId}`,
    layerId: `${TEMP_HEATMAP_LAYER_PREFIX}${layerId}`
  };
}

function listTempHeatmapLayerIds(map) {
  const layers = map.getStyle()?.layers ?? [];
  return layers
    .map((layer) => layer.id)
    .filter((id) => id.startsWith(TEMP_HEATMAP_LAYER_PREFIX));
}

function removeTempHeatmap(map, layerId) {
  const ids = tempHeatmapIds(layerId);
  if (map.getLayer(ids.layerId)) {
    map.removeLayer(ids.layerId);
  }
  if (map.getSource(ids.sourceId)) {
    map.removeSource(ids.sourceId);
  }
}

function ensureTempHeatmap(map, layer, filters = {}) {
  const ids = tempHeatmapIds(layer.id);
  const data = collectionFromFeatures(filterFeatures(layer.features ?? [], filters));
  const color = heatmapColorForLayer(
    layer.markerColor
      ? resolveTempSourceMarkerColor(layer.markerColor, layer.source)
      : DEFAULT_POINT_COLOR
  );

  if (!map.getSource(ids.sourceId)) {
    map.addSource(ids.sourceId, {
      type: "geojson",
      data
    });
  } else {
    map.getSource(ids.sourceId).setData(data);
  }

  if (!map.getLayer(ids.layerId)) {
    map.addLayer(
      {
        id: ids.layerId,
        type: "heatmap",
        source: ids.sourceId,
        layout: {
          visibility: "visible"
        },
        paint: heatmapPaint(color)
      },
      getHeatmapBeforeId(map)
    );
  }

  applyPaintToLayer(map, ids.layerId, color);
  map.setLayoutProperty(ids.layerId, "visibility", "visible");
}

/**
 * Отдельные тепловые карты по временным слоям (режим внешних/временных данных).
 * Слои с heatmapEnabled получают свою заливку, даже если маркеры скрыты.
 */
export function syncTempLayerHeatmaps(map, { active = false, filters = {}, layers = [] } = {}) {
  if (!map?.getStyle) {
    return;
  }

  const wanted = active ? layers.filter((layer) => layer.heatmapEnabled) : [];
  const wantedIds = new Set(wanted.map((layer) => layer.id));

  listTempHeatmapLayerIds(map).forEach((mapLayerId) => {
    const layerId = mapLayerId.slice(TEMP_HEATMAP_LAYER_PREFIX.length);
    if (!wantedIds.has(layerId)) {
      removeTempHeatmap(map, layerId);
    }
  });

  wanted.forEach((layer) => {
    ensureTempHeatmap(map, layer, filters);
  });
}
