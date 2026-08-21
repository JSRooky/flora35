import {
  DEFAULT_CLUSTER_COLOR,
  getPointColorExpression
} from "./pointColors";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";

export const MERGED_SOURCE_ID = "merged-locations";
export const MERGED_UNCLUSTERED_LAYER_ID = "merged-unclustered";
export const MERGED_CLUSTER_LAYER_ID = "merged-clusters";
export const MERGED_CLUSTER_COUNT_LAYER_ID = "merged-cluster-count";

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

const MERGED_LAYER_IDS = [
  MERGED_CLUSTER_LAYER_ID,
  MERGED_CLUSTER_COUNT_LAYER_ID,
  MERGED_UNCLUSTERED_LAYER_ID
];

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const MARKER_RADIUS = 5;

/** @type {GeoJSON.FeatureCollection} */
let mergedCollection = EMPTY_FEATURE_COLLECTION;
let layerVisible = true;
let mergedClusteringEnabled = true;
let onPointClickCallback = null;
let interactionHandlers = null;

function isMergedMapboxClusteringActive() {
  return mergedClusteringEnabled;
}

function applyVisibility(map) {
  MERGED_LAYER_IDS.forEach((layerId) => {
    if (!map?.getLayer?.(layerId)) {
      return;
    }

    map.setLayoutProperty(
      layerId,
      "visibility",
      layerVisible ? "visible" : "none"
    );
  });
}

function detachInteractions(map) {
  if (!interactionHandlers) {
    return;
  }

  if (map) {
    map.off("click", MERGED_UNCLUSTERED_LAYER_ID, interactionHandlers.click);
    map.off("mouseenter", MERGED_UNCLUSTERED_LAYER_ID, interactionHandlers.enter);
    map.off("mouseleave", MERGED_UNCLUSTERED_LAYER_ID, interactionHandlers.leave);
    if (interactionHandlers.clusterClick) {
      map.off("click", MERGED_CLUSTER_LAYER_ID, interactionHandlers.clusterClick);
      map.off("mouseenter", MERGED_CLUSTER_LAYER_ID, interactionHandlers.clusterEnter);
      map.off("mouseleave", MERGED_CLUSTER_LAYER_ID, interactionHandlers.clusterLeave);
      map.off("click", MERGED_CLUSTER_COUNT_LAYER_ID, interactionHandlers.clusterClick);
      map.off("mouseenter", MERGED_CLUSTER_COUNT_LAYER_ID, interactionHandlers.clusterEnter);
      map.off("mouseleave", MERGED_CLUSTER_COUNT_LAYER_ID, interactionHandlers.clusterLeave);
    }
  }

  interactionHandlers = null;
}

function attachInteractions(map) {
  if (!map) {
    return;
  }

  detachInteractions(map);

  const handleClick = (event) => {
    const feature =
      event.features?.[0] ??
      safeQueryRenderedFeatures(map, event.point, {
        layers: [MERGED_UNCLUSTERED_LAYER_ID]
      })?.[0];
    if (!feature) {
      return;
    }

    // Не даём клику «провалиться» в map-background clear (локальный mapClick).
    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();

    onPointClickCallback?.(feature);
  };

  const handleEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  const clusterClick = (event) => {
    const feature =
      event.features?.[0] ??
      safeQueryRenderedFeatures(map, event.point, {
        layers: [MERGED_CLUSTER_LAYER_ID]
      })?.[0];
    const clusterId = feature?.properties?.cluster_id;
    const source = map.getSource(MERGED_SOURCE_ID);

    if (clusterId == null || !source?.getClusterExpansionZoom) {
      return;
    }

    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();

    source.getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error) {
        return;
      }

      map.easeTo({
        center: feature.geometry.coordinates,
        zoom
      });
    });
  };

  map.on("click", MERGED_UNCLUSTERED_LAYER_ID, handleClick);
  map.on("mouseenter", MERGED_UNCLUSTERED_LAYER_ID, handleEnter);
  map.on("mouseleave", MERGED_UNCLUSTERED_LAYER_ID, handleLeave);

  if (map.getLayer(MERGED_CLUSTER_LAYER_ID)) {
    map.on("click", MERGED_CLUSTER_LAYER_ID, clusterClick);
    map.on("mouseenter", MERGED_CLUSTER_LAYER_ID, handleEnter);
    map.on("mouseleave", MERGED_CLUSTER_LAYER_ID, handleLeave);
  }
  if (map.getLayer(MERGED_CLUSTER_COUNT_LAYER_ID)) {
    map.on("click", MERGED_CLUSTER_COUNT_LAYER_ID, clusterClick);
    map.on("mouseenter", MERGED_CLUSTER_COUNT_LAYER_ID, handleEnter);
    map.on("mouseleave", MERGED_CLUSTER_COUNT_LAYER_ID, handleLeave);
  }

  interactionHandlers = {
    click: handleClick,
    enter: handleEnter,
    leave: handleLeave,
    clusterClick,
    clusterEnter: handleEnter,
    clusterLeave: handleLeave
  };
}

function addMergedUnclusteredLayer(map) {
  if (!map) {
    return;
  }

  const unclusteredFilter = isMergedMapboxClusteringActive()
    ? ["!", ["has", "point_count"]]
    : null;
  const existing = map.getLayer(MERGED_UNCLUSTERED_LAYER_ID);

  if (existing && existing.type !== "circle") {
    map.removeLayer(MERGED_UNCLUSTERED_LAYER_ID);
  } else if (existing) {
    map.setPaintProperty(
      MERGED_UNCLUSTERED_LAYER_ID,
      "circle-color",
      getPointColorExpression()
    );
    map.setPaintProperty(MERGED_UNCLUSTERED_LAYER_ID, "circle-radius", MARKER_RADIUS);
    map.setPaintProperty(MERGED_UNCLUSTERED_LAYER_ID, "circle-stroke-width", 1);
    map.setPaintProperty(MERGED_UNCLUSTERED_LAYER_ID, "circle-stroke-color", "#ffffff");
    map.setFilter(MERGED_UNCLUSTERED_LAYER_ID, unclusteredFilter);
    return;
  }

  map.addLayer({
    id: MERGED_UNCLUSTERED_LAYER_ID,
    type: "circle",
    source: MERGED_SOURCE_ID,
    ...(unclusteredFilter ? { filter: unclusteredFilter } : {}),
    paint: {
      "circle-color": getPointColorExpression(),
      "circle-radius": MARKER_RADIUS,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });
}

function addMergedClusterLayers(map) {
  if (!map || !isMergedMapboxClusteringActive()) {
    return;
  }

  if (!map.getLayer(MERGED_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: MERGED_CLUSTER_LAYER_ID,
      type: "circle",
      source: MERGED_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": DEFAULT_CLUSTER_COLOR,
        "circle-radius": ["step", ["get", "point_count"], 16, 50, 20, 200, 26],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff"
      }
    });
  }

  if (!map.getLayer(MERGED_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: MERGED_CLUSTER_COUNT_LAYER_ID,
      type: "symbol",
      source: MERGED_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12
      },
      paint: {
        "text-color": "#ffffff"
      }
    });
  }
}

function addMergedSource(map) {
  if (!map || map.getSource(MERGED_SOURCE_ID)) {
    return;
  }

  map.addSource(MERGED_SOURCE_ID, {
    type: "geojson",
    data: mergedCollection,
    ...(isMergedMapboxClusteringActive()
      ? { cluster: true, ...CLUSTER_OPTIONS }
      : {})
  });
}

function removeMergedLayersAndSource(map) {
  if (!map) {
    return;
  }

  detachInteractions(map);
  MERGED_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });
  if (map.getSource(MERGED_SOURCE_ID)) {
    map.removeSource(MERGED_SOURCE_ID);
  }
}

function mountMergedLayers(map) {
  addMergedSource(map);
  addMergedClusterLayers(map);
  addMergedUnclusteredLayer(map);
  attachInteractions(map);
  applyVisibility(map);
}

function rebuildMergedLayers(map) {
  if (!map) {
    return;
  }

  removeMergedLayersAndSource(map);
  mountMergedLayers(map);
}

/**
 * Создаёт слой слитых точек (кластеризация как у остальных точек карты).
 * @param {import("mapbox-gl").Map} map
 * @param {{ onPointClick?: Function }} [options]
 */
export function addMergedLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }

  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }

  if (map.getSource(MERGED_SOURCE_ID)) {
    setMergedData(map, mergedCollection);
    mountMergedLayers(map);
    return;
  }

  mountMergedLayers(map);
}

/**
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {GeoJSON.FeatureCollection|object[]|null|undefined} collectionOrFeatures
 * @param {{ preview?: boolean }} [options]
 */
export function setMergedData(map, collectionOrFeatures, options = {}) {
  const collection = Array.isArray(collectionOrFeatures)
    ? { type: "FeatureCollection", features: collectionOrFeatures }
    : collectionOrFeatures?.type === "FeatureCollection"
      ? collectionOrFeatures
      : EMPTY_FEATURE_COLLECTION;

  const nextCollection = {
    type: "FeatureCollection",
    features: collection.features ?? []
  };

  if (!options.preview) {
    mergedCollection = nextCollection;
  }

  if (!map) {
    return;
  }

  if (!map.getSource(MERGED_SOURCE_ID)) {
    addMergedLayer(map);
    return;
  }

  map.getSource(MERGED_SOURCE_ID)?.setData(nextCollection);
  applyVisibility(map);
}

/** Добавляет одну feature на слой (если ещё нет с тем же id). */
export function upsertMergedFeature(map, feature) {
  if (!feature) {
    return;
  }

  const featureId = feature.id ?? feature.properties?.merged_id;
  const features = [...(mergedCollection.features ?? [])];
  const index = features.findIndex(
    (item) => (item.id ?? item.properties?.merged_id) === featureId
  );

  if (index >= 0) {
    features[index] = feature;
  } else {
    features.push(feature);
  }

  setMergedData(map, {
    type: "FeatureCollection",
    features
  });
}

/**
 * Удаляет feature со слоя по merged_id / id.
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {string} featureId
 * @returns {object[]} оставшиеся features
 */
export function removeMergedFeature(map, featureId) {
  const id = String(featureId ?? "").trim();
  if (!id) {
    return mergedCollection.features ?? [];
  }

  const features = (mergedCollection.features ?? []).filter(
    (item) => String(item.id ?? item.properties?.merged_id ?? "") !== id
  );

  setMergedData(map, {
    type: "FeatureCollection",
    features
  });

  return features;
}

export function setMergedVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (map) {
    applyVisibility(map);
  }
}

export function isMergedLayerVisible() {
  return layerVisible;
}

export function applyMergedGroupingMode(map, { clusteringEnabled: nextClustering } = {}) {
  if (nextClustering === undefined) {
    return;
  }

  const enabled = Boolean(nextClustering);
  if (mergedClusteringEnabled === enabled) {
    return;
  }

  mergedClusteringEnabled = enabled;
  if (map) {
    rebuildMergedLayers(map);
  }
}

/** Id интерактивных слоёв слитых точек (для проверки hit при клике по карте). */
export function getMergedInteractiveLayerIds(map) {
  return [MERGED_UNCLUSTERED_LAYER_ID, MERGED_CLUSTER_LAYER_ID, MERGED_CLUSTER_COUNT_LAYER_ID].filter((layerId) =>
    map?.getLayer?.(layerId)
  );
}

export function getMergedFeatures() {
  return mergedCollection.features ?? [];
}

export function getMergedFeatureCollection() {
  return mergedCollection;
}
