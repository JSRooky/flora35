import {
  findGbifFeatureByKey,
  getGbifFeatureCollection
} from "../gbif/gbifStore";
import "../styles/GbifPanel.css";

export const GBIF_SOURCE_ID = "gbif-locations";
export const GBIF_CLUSTER_LAYER_ID = "gbif-clusters";
export const GBIF_CLUSTER_COUNT_LAYER_ID = "gbif-cluster-count";
export const GBIF_UNCLUSTERED_LAYER_ID = "gbif-unclustered";

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

/** Отличительный цвет GBIF (не путать с локальными точками Красной книги). */
const GBIF_POINT_COLOR = "#0d9488";
const GBIF_CLUSTER_COLOR = "#0f766e";
const MARKER_RADIUS = 5;

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let interactionHandlers = null;
let onPointClickCallback = null;
let layerVisible = true;
/** Ключи точек, скрытых под булавкой выделения / share. */
let hiddenPointFeatureKeys = [];

/** Выражение Mapbox: скрыть feature, совпадающий с ключом булавки. */
function buildPinnedKeyExclusion(key) {
  return [
    "!",
    [
      "any",
      ["==", ["to-string", ["id"]], key],
      ["==", ["to-string", ["coalesce", ["get", "finding_id"], ""]], key],
      ["==", ["to-string", ["coalesce", ["get", "gbif_key"], ""]], key],
      [
        "==",
        ["concat", "gbif-", ["to-string", ["coalesce", ["get", "gbif_key"], ""]]],
        key
      ]
    ]
  ];
}

function applyGbifUnclusteredFilter(map) {
  if (!map?.getLayer(GBIF_UNCLUSTERED_LAYER_ID)) {
    return;
  }

  const parts = [["!", ["has", "point_count"]]];

  hiddenPointFeatureKeys.forEach((key) => {
    parts.push(buildPinnedKeyExclusion(key));
  });

  map.setFilter(
    GBIF_UNCLUSTERED_LAYER_ID,
    parts.length === 1 ? parts[0] : ["all", ...parts]
  );
}

/**
 * Скрывает обычные маркеры GBIF для точек, показанных булавкой
 * (выделение в «Сведения о точке» или share-ссылка).
 */
export function setGbifHiddenPointFeatureKeys(map, keys) {
  hiddenPointFeatureKeys = [...new Set((keys ?? []).filter(Boolean).map(String))];
  if (map) {
    applyGbifUnclusteredFilter(map);
  }
}

function resolveClickedFeature(rawFeature) {
  const gbifKey = rawFeature?.properties?.gbif_key;
  const fromStore = findGbifFeatureByKey(gbifKey);

  if (fromStore) {
    return fromStore;
  }

  // Fallback, если store ещё не синхронизирован.
  return {
    type: "Feature",
    id: rawFeature.id ?? (gbifKey != null ? `gbif-${gbifKey}` : undefined),
    geometry: rawFeature.geometry,
    properties: {
      ...rawFeature.properties,
      source: rawFeature.properties?.source ?? "gbif"
    }
  };
}

function detachInteractions(map) {
  if (!interactionHandlers || !map) {
    interactionHandlers = null;
    return;
  }

  const {
    clusterClick,
    clusterEnter,
    clusterLeave,
    pointClick,
    pointEnter,
    pointLeave
  } = interactionHandlers;

  if (map.getLayer(GBIF_CLUSTER_LAYER_ID)) {
    map.off("click", GBIF_CLUSTER_LAYER_ID, clusterClick);
    map.off("mouseenter", GBIF_CLUSTER_LAYER_ID, clusterEnter);
    map.off("mouseleave", GBIF_CLUSTER_LAYER_ID, clusterLeave);
  }

  if (map.getLayer(GBIF_UNCLUSTERED_LAYER_ID)) {
    map.off("click", GBIF_UNCLUSTERED_LAYER_ID, pointClick);
    map.off("mouseenter", GBIF_UNCLUSTERED_LAYER_ID, pointEnter);
    map.off("mouseleave", GBIF_UNCLUSTERED_LAYER_ID, pointLeave);
  }

  interactionHandlers = null;
}

function attachInteractions(map) {
  detachInteractions(map);

  const clusterClick = (event) => {
    const features = map.queryRenderedFeatures(event.point, {
      layers: [GBIF_CLUSTER_LAYER_ID]
    });
    const clusterId = features[0]?.properties?.cluster_id;
    const source = map.getSource(GBIF_SOURCE_ID);

    if (clusterId == null || !source) {
      return;
    }

    source.getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error) {
        return;
      }

      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom
      });
    });
  };

  const clusterEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const clusterLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  const pointClick = (event) => {
    const rawFeature = event.features?.[0];
    if (!rawFeature) {
      return;
    }

    // Не даём клику «провалиться» в локальный слой под маркером GBIF.
    event.originalEvent?.stopPropagation?.();

    const feature = resolveClickedFeature(rawFeature);
    onPointClickCallback?.(feature);
  };

  const pointEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const pointLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  if (map.getLayer(GBIF_CLUSTER_LAYER_ID)) {
    map.on("click", GBIF_CLUSTER_LAYER_ID, clusterClick);
    map.on("mouseenter", GBIF_CLUSTER_LAYER_ID, clusterEnter);
    map.on("mouseleave", GBIF_CLUSTER_LAYER_ID, clusterLeave);
  }

  if (map.getLayer(GBIF_UNCLUSTERED_LAYER_ID)) {
    map.on("click", GBIF_UNCLUSTERED_LAYER_ID, pointClick);
    map.on("mouseenter", GBIF_UNCLUSTERED_LAYER_ID, pointEnter);
    map.on("mouseleave", GBIF_UNCLUSTERED_LAYER_ID, pointLeave);
  }

  interactionHandlers = {
    clusterClick,
    clusterEnter,
    clusterLeave,
    pointClick,
    pointEnter,
    pointLeave
  };
}

function applyVisibility(map) {
  const visibility = layerVisible ? "visible" : "none";

  [
    GBIF_CLUSTER_LAYER_ID,
    GBIF_CLUSTER_COUNT_LAYER_ID,
    GBIF_UNCLUSTERED_LAYER_ID
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

/**
 * Создаёт отдельный слой точек GBIF (кластеризация, бирюзовый стиль).
 * Данные берутся из gbifStore; повторный вызов безопасен.
 */
export function addGbifLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }

  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }

  if (map.getSource(GBIF_SOURCE_ID)) {
    setGbifData(map, getGbifFeatureCollection());
    if (!interactionHandlers) {
      attachInteractions(map);
    }
    applyVisibility(map);
    applyGbifUnclusteredFilter(map);
    return;
  }

  map.addSource(GBIF_SOURCE_ID, {
    type: "geojson",
    data: getGbifFeatureCollection(),
    cluster: true,
    ...CLUSTER_OPTIONS
  });

  map.addLayer({
    id: GBIF_CLUSTER_LAYER_ID,
    type: "circle",
    source: GBIF_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": GBIF_CLUSTER_COLOR,
      "circle-radius": ["step", ["get", "point_count"], 16, 50, 20, 200, 26],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: GBIF_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: GBIF_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: GBIF_UNCLUSTERED_LAYER_ID,
    type: "circle",
    source: GBIF_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": GBIF_POINT_COLOR,
      "circle-radius": MARKER_RADIUS,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });

  attachInteractions(map);
  applyVisibility(map);
  applyGbifUnclusteredFilter(map);
}

/** Обновляет GeoJSON источника gbif-locations. */
export function setGbifData(map, collection) {
  if (!map) {
    return;
  }

  const data = collection?.type === "FeatureCollection" ? collection : EMPTY_FEATURE_COLLECTION;
  const source = map.getSource(GBIF_SOURCE_ID);

  if (!source) {
    addGbifLayer(map);
    const created = map.getSource(GBIF_SOURCE_ID);
    created?.setData(data);
    return;
  }

  source.setData(data);
  applyGbifUnclusteredFilter(map);
}

/** Очищает точки GBIF на карте (источник остаётся). */
export function clearGbifLayer(map) {
  setGbifData(map, EMPTY_FEATURE_COLLECTION);
}

/** Показывает или скрывает слой GBIF. */
export function setGbifVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (map) {
    applyVisibility(map);
  }
}

export function isGbifLayerVisible() {
  return layerVisible;
}

/** Задаёт обработчик клика по точке GBIF (панель «Сведения о точке»). */
export function setGbifPointClickHandler(handler) {
  onPointClickCallback = handler ?? null;
}
