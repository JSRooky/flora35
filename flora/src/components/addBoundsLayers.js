import {
  BOUNDS_LAYER_DEFINITIONS,
  BOUNDS_LAYER_KINDS
} from "../firebase/boundsCollectionFirestore";
import { loadBoundsLayerGeoJSONFromFirestore } from "../firebase/loadBoundsFromFirestore";
import { applyMapCursor, getFirstLocationsLayerId } from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const dataCache = new Map();
// Промисы в процессе загрузки — чтобы два быстрых переключения одного слоя
// не запускали два параллельных запроса в Firestore.
const pendingLoads = new Map();
// Последнее запрошенное состояние видимости — чтобы не включить слой после
// await, если пользователь уже успел выключить его обратно во время загрузки.
const desiredVisibility = new Map();
const mapsWithCursorHandlers = new WeakSet();

function getInteractiveBoundsLayerIds(map) {
  return BOUNDS_LAYER_DEFINITIONS.filter(
    (definition) => definition.kind === BOUNDS_LAYER_KINDS.POLYGON
  )
    .flatMap((definition) => [getFillLayerId(definition.id), getOutlineLayerId(definition.id)])
    .filter(
      (layerId) =>
        map.getLayer(layerId) && map.getLayoutProperty(layerId, "visibility") !== "none"
    );
}

function getBoundsLayerDefinitionForFeatureLayerId(layerId) {
  return BOUNDS_LAYER_DEFINITIONS.find(
    (definition) =>
      layerId === getFillLayerId(definition.id) || layerId === getOutlineLayerId(definition.id)
  );
}

function getFeatureIdentityKey(properties = {}) {
  const rawKey = properties.nid ?? properties.OSM_ID ?? properties.id;
  return rawKey != null ? String(rawKey) : null;
}

/**
 * mapboxgl.queryRenderedFeatures возвращает геометрию, обрезанную по тайлу —
 * для больших полигонов (например, заповедников) это делает площадь и форму
 * некорректными. Подменяем на полную геометрию из уже загруженного GeoJSON.
 */
function resolveFullBoundsFeature(definition, feature) {
  const cached = dataCache.get(definition.id);
  const targetKey = getFeatureIdentityKey(feature.properties);

  if (!cached || targetKey == null) {
    return feature;
  }

  const fullFeature = cached.features.find(
    (candidate) => getFeatureIdentityKey(candidate.properties) === targetKey
  );

  return fullFeature ?? feature;
}

function findBoundsFeatureAtPoint(map, point) {
  const layerIds = getInteractiveBoundsLayerIds(map);
  if (!layerIds.length) {
    return null;
  }

  const features = map.queryRenderedFeatures(point, { layers: layerIds });
  if (!features.length) {
    return null;
  }

  const feature = features[0];
  const definition = getBoundsLayerDefinitionForFeatureLayerId(feature.layer.id);
  if (!definition) {
    return null;
  }

  return { definition, feature: resolveFullBoundsFeature(definition, feature) };
}

const PAINT_BY_LAYER = {
  nature_reserve_polygon: {
    fillColor: [
      "match",
      ["get", "BOUNDARY"],
      "national_park",
      "#52966a",
      "protected_area",
      "#5fa67a",
      "boundary",
      "#78b088",
      "#68a878"
    ],
    outlineColor: [
      "match",
      ["get", "BOUNDARY"],
      "national_park",
      "#3d7352",
      "protected_area",
      "#4a8260",
      "boundary",
      "#5f9470",
      "#508a62"
    ],
    fillOpacity: 0.22
  },
  oopt_pol: {
    fillColor: "#6b94c4",
    outlineColor: "#4a72a8",
    fillOpacity: 0.22
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

/** Возвращает полигон границ в точке клика или null. */
export function getBoundsFeatureAtClick(map, event) {
  if (!map || !event?.point) {
    return null;
  }

  const hit = findBoundsFeatureAtPoint(map, event.point);
  if (!hit) {
    return null;
  }

  return hit;
}

/** Проверяет, попадает ли точка клика в видимый полигон границ. */
export function isBoundsFeatureAtPoint(map, point) {
  return Boolean(map && point && findBoundsFeatureAtPoint(map, point));
}

function attachBoundsCursorHandlers(map, definition) {
  if (definition.kind !== BOUNDS_LAYER_KINDS.POLYGON) {
    return;
  }

  [getFillLayerId(definition.id), getOutlineLayerId(definition.id)].forEach((layerId) => {
    // applyMapCursor уважает setMapCursorOverride (например, crosshair при
    // указании места находки) — прямая запись в style.cursor его перебивала бы.
    map.on("mouseenter", layerId, () => {
      applyMapCursor(map, "pointer");
    });

    map.on("mouseleave", layerId, () => {
      applyMapCursor(map, "");
    });
  });
}

function attachBoundsInteractions(map) {
  if (mapsWithCursorHandlers.has(map)) {
    return;
  }

  mapsWithCursorHandlers.add(map);
  BOUNDS_LAYER_DEFINITIONS.forEach((definition) => attachBoundsCursorHandlers(map, definition));
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
            "line-width": 1.25,
            "line-opacity": 0.55
          }
        },
        beforeId
      );
    }

    attachBoundsInteractions(map);
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
  pendingLoads.clear();
  desiredVisibility.clear();
}

/** Показывает или скрывает слой границ, при необходимости загружая данные из Firestore. */
export async function setBoundsLayerVisible(map, layerId, visible) {
  const definition = BOUNDS_LAYER_DEFINITIONS.find((item) => item.id === layerId);
  if (!definition) {
    return;
  }

  ensureBoundsLayer(map, definition);
  desiredVisibility.set(layerId, visible);

  if (!visible) {
    setLayersVisibility(map, definition, false);
    return;
  }

  if (!dataCache.has(layerId)) {
    let loadPromise = pendingLoads.get(layerId);

    if (!loadPromise) {
      loadPromise = loadBoundsLayerGeoJSONFromFirestore(layerId).finally(() => {
        pendingLoads.delete(layerId);
      });
      pendingLoads.set(layerId, loadPromise);
    }

    const geojson = await loadPromise;

    if (!geojson.features.length) {
      throw new Error(
        "В Firestore нет данных для этого слоя. Выполните npm run import:firestore-bounds"
      );
    }

    dataCache.set(layerId, geojson);
    map.getSource(getSourceId(layerId)).setData(geojson);
  }

  // Пока шла загрузка, видимость могли переключить обратно — не включаем слой,
  // который пользователь уже успел снова выключить.
  if (desiredVisibility.get(layerId) !== true) {
    return;
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
