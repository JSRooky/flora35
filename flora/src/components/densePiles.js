import { getFeatureCoordinates } from "./spreadCoincidentPoints";

/** Минимум точек с полностью одинаковыми координатами для сверхплотного кластера. */
export const MIN_DENSE_PILE_SIZE = 10;

export const DENSE_HIGHLIGHT_COLOR = "#ea580c";
export const DENSE_HIGHLIGHT_STROKE_COLOR = "#9a3412";

export const DENSE_PILES_SOURCE_ID = "dense-piles";
export const DENSE_PILES_CLUSTER_LAYER_ID = "dense-piles-clusters";
export const DENSE_PILES_COUNT_LAYER_ID = "dense-piles-count";

export const GBIF_DENSE_PILES_SOURCE_ID = "gbif-dense-piles";
export const GBIF_DENSE_PILES_CLUSTER_LAYER_ID = "gbif-dense-piles-clusters";
export const GBIF_DENSE_PILES_COUNT_LAYER_ID = "gbif-dense-piles-count";

/** Ключ по точным координатам точки. */
export function exactCoordKey(lng, lat) {
  return `${lng},${lat}`;
}

function abbreviatePointCount(count) {
  if (count >= 10000) {
    return `${Math.round(count / 1000)}k`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 100) / 10}k`;
  }
  return String(count);
}

/**
 * Делит точки на сверхплотные кластеры и остальные.
 * Сверхплотный кластер — ≥ minSize точек с полностью одинаковыми координатами.
 * Раскрытые кучи возвращаются отдельно (expandedDenseFeatures).
 */
export function partitionFeaturesByDensePiles(
  features,
  { minSize = MIN_DENSE_PILE_SIZE, expandedPileKeys = null } = {}
) {
  const groups = new Map();

  (features ?? []).forEach((feature) => {
    const coordinates = getFeatureCoordinates(feature);
    if (!coordinates) {
      return;
    }

    const key = exactCoordKey(coordinates[0], coordinates[1]);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        coordinates,
        members: []
      });
    }
    groups.get(key).members.push(feature);
  });

  const otherFeatures = [];
  const expandedDenseFeatures = [];
  const denseClusterFeatures = [];
  const densePileMembersById = new Map();

  groups.forEach((group) => {
    const isDense = group.members.length >= minSize;
    const isExpanded = expandedPileKeys?.has(group.key);

    if (!isDense) {
      otherFeatures.push(...group.members);
      return;
    }

    const clusterId = `dense-${group.key}`;
    densePileMembersById.set(clusterId, group.members);

    if (isExpanded) {
      expandedDenseFeatures.push(...group.members);
      return;
    }

    denseClusterFeatures.push({
      type: "Feature",
      id: clusterId,
      geometry: {
        type: "Point",
        coordinates: group.coordinates
      },
      properties: {
        cluster: true,
        dense_pile: true,
        dense_pile_key: group.key,
        point_count: group.members.length,
        point_count_abbreviated: abbreviatePointCount(group.members.length)
      }
    });
  });

  return {
    otherFeatures,
    expandedDenseFeatures,
    denseClusterFeatures,
    densePileMembersById
  };
}

export function getDenseClusterCirclePaint() {
  return {
    "circle-color": DENSE_HIGHLIGHT_COLOR,
    "circle-radius": ["step", ["get", "point_count"], 18, 20, 24, 50, 28, 100, 34],
    "circle-stroke-width": 2,
    "circle-stroke-color": DENSE_HIGHLIGHT_STROKE_COLOR
  };
}

/** Удаляет источник и слои сверхплотных кластеров. */
export function removeDensePilesLayers(
  map,
  {
    sourceId,
    clusterLayerId,
    countLayerId
  } = {}
) {
  if (!map?.getStyle?.() || !sourceId || !clusterLayerId || !countLayerId) {
    return;
  }

  [countLayerId, clusterLayerId].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

/**
 * Создаёт (или пересоздаёт) источник и слои сверхплотных кластеров.
 * Пустой набор features допустим — чтобы потом обновлять через setData.
 */
export function ensureDensePilesLayers(
  map,
  {
    sourceId,
    clusterLayerId,
    countLayerId,
    features = [],
    visibility = "visible"
  } = {}
) {
  if (!map?.getStyle?.() || !sourceId || !clusterLayerId || !countLayerId) {
    return;
  }

  removeDensePilesLayers(map, { sourceId, clusterLayerId, countLayerId });

  map.addSource(sourceId, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features
    }
  });

  map.addLayer({
    id: clusterLayerId,
    type: "circle",
    source: sourceId,
    layout: {
      visibility
    },
    paint: getDenseClusterCirclePaint()
  });

  map.addLayer({
    id: countLayerId,
    type: "symbol",
    source: sourceId,
    layout: {
      visibility,
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });
}

export function setDensePilesData(map, sourceId, features = []) {
  map?.getSource(sourceId)?.setData({
    type: "FeatureCollection",
    features
  });
}
