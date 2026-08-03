import {
  BOUNDS_LAYER_DEFINITIONS,
  BOUNDS_LAYER_KINDS
} from "../firebase/boundsCollectionFirestore";
import { loadBoundsLayerGeoJSONFromFirestore } from "../firebase/loadBoundsFromFirestore";
import { getFirstLocationsLayerId } from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const dataCache = new Map();

const PAINT_BY_LAYER = {
  nature_reserve_polygon: {
    fillColor: [
      "match",
      ["get", "BOUNDARY"],
      "national_park",
      "#2d7a4f",
      "protected_area",
      "#3d9970",
      "boundary",
      "#6aab82",
      "#4caf50"
    ],
    outlineColor: [
      "match",
      ["get", "BOUNDARY"],
      "national_park",
      "#1e5631",
      "protected_area",
      "#2d7a4f",
      "boundary",
      "#4d8a66",
      "#388e3c"
    ],
    fillOpacity: 0.28
  },
  oopt_pol: {
    fillColor: "#3b82f6",
    outlineColor: "#1d4ed8",
    fillOpacity: 0.28
  },
  oopt_oz_pol: {
    fillColor: "#8b5cf6",
    outlineColor: "#6d28d9",
    fillOpacity: 0.28
  }
};

function getSourceId(layerId) {
  return `bounds-${layerId}`;
}

function getFillLayerId(layerId) {
  return `bounds-${layerId}-fill`;
}

function getOutlineLayerId(layerId) {
  return `bounds-${layerId}-outline`;
}

function getCircleLayerId(layerId) {
  return `bounds-${layerId}-circle`;
}

function getMapLayerIds(definition) {
  if (definition.kind === BOUNDS_LAYER_KINDS.POINT) {
    return [getCircleLayerId(definition.id)];
  }

  return [getFillLayerId(definition.id), getOutlineLayerId(definition.id)];
}

function setLayersVisibility(map, definition, visible) {
  const visibility = visible ? "visible" : "none";
  getMapLayerIds(definition).forEach((layerId) => {
    map.setLayoutProperty(layerId, "visibility", visibility);
  });
}

function ensureBoundsLayer(map, definition) {
  const sourceId = getSourceId(definition.id);
  const paint = PAINT_BY_LAYER[definition.id];

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: EMPTY_COLLECTION
    });
  }

  const beforeId = getFirstLocationsLayerId(map);

  if (definition.kind === BOUNDS_LAYER_KINDS.POLYGON) {
    const fillLayerId = getFillLayerId(definition.id);
    const outlineLayerId = getOutlineLayerId(definition.id);

    if (!map.getLayer(fillLayerId)) {
      map.addLayer(
        {
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          layout: {
            visibility: "none"
          },
          paint: {
            "fill-color": paint.fillColor,
            "fill-opacity": paint.fillOpacity ?? 0.28,
            "fill-antialias": true
          }
        },
        beforeId
      );
    }

    if (!map.getLayer(outlineLayerId)) {
      map.addLayer(
        {
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          layout: {
            visibility: "none"
          },
          paint: {
            "line-color": paint.outlineColor,
            "line-width": 1.5,
            "line-opacity": 0.75
          }
        },
        beforeId
      );
    }

    return;
  }

  const circleLayerId = getCircleLayerId(definition.id);

  if (!map.getLayer(circleLayerId)) {
    map.addLayer(
      {
        id: circleLayerId,
        type: "circle",
        source: sourceId,
        layout: {
          visibility: "none"
        },
        paint: {
          "circle-color": paint.circleColor,
          "circle-radius": paint.circleRadius ?? 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9
        }
      },
      beforeId
    );
  }
}

/** Добавляет на карту пустые слои границ (данные подгружаются из Firestore по запросу). */
export function addBoundsLayers(map) {
  BOUNDS_LAYER_DEFINITIONS.forEach((definition) => ensureBoundsLayer(map, definition));
}

/** Сбрасывает кэш GeoJSON, загруженный из Firestore. */
export function clearBoundsLayerCache() {
  dataCache.clear();
}

/** Показывает или скрывает слой границ, при необходимости загружая данные из Firestore. */
export async function setBoundsLayerVisible(map, layerId, visible) {
  const definition = BOUNDS_LAYER_DEFINITIONS.find((item) => item.id === layerId);
  if (!definition) {
    return;
  }

  ensureBoundsLayer(map, definition);

  if (!visible) {
    setLayersVisibility(map, definition, false);
    return;
  }

  if (!dataCache.has(layerId)) {
    const geojson = await loadBoundsLayerGeoJSONFromFirestore(layerId);

    if (!geojson.features.length) {
      throw new Error(
        "В Firestore нет данных для этого слоя. Выполните npm run import:firestore-bounds"
      );
    }

    dataCache.set(layerId, geojson);
    map.getSource(getSourceId(layerId)).setData(geojson);
  }

  setLayersVisibility(map, definition, true);
}

/** Синхронизирует видимость всех слоёв границ. Возвращает ошибки по layer_id. */
export async function syncBoundsLayersVisibility(map, visibilityById = {}) {
  const errors = {};

  await Promise.all(
    BOUNDS_LAYER_DEFINITIONS.map(async ({ id }) => {
      try {
        await setBoundsLayerVisible(map, id, Boolean(visibilityById[id]));
      } catch (error) {
        errors[id] = error?.message || String(error);
      }
    })
  );

  return errors;
}
