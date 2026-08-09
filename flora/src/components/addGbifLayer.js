import {
  findGbifFeatureByKey,
  getGbifFeatureCollection
} from "../gbif/gbifStore";
import {
  DEFAULT_CLUSTER_COLOR,
  REGNUM_COLORS,
  getPointColorExpression,
  getPointColorForRegnum
} from "./pointColors";
import {
  GBIF_DENSE_PILES_CLUSTER_LAYER_ID,
  GBIF_DENSE_PILES_COUNT_LAYER_ID,
  GBIF_DENSE_PILES_SOURCE_ID,
  ensureDensePilesLayers,
  partitionFeaturesByDensePiles,
  removeDensePilesLayers,
  setDensePilesData
} from "./densePiles";
import {
  COORDINATES_ORIGINAL_PROP,
  getFeatureCoordinates,
  getSpreadPileFitBounds,
  spreadCoincidentFeatures
} from "./spreadCoincidentPoints";
import "../styles/GbifPanel.css";

export const GBIF_SOURCE_ID = "gbif-locations";
export const GBIF_CLUSTER_LAYER_ID = "gbif-clusters";
export const GBIF_CLUSTER_COUNT_LAYER_ID = "gbif-cluster-count";
export const GBIF_UNCLUSTERED_LAYER_ID = "gbif-unclustered";

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

const MARKER_RADIUS = 5;
const REGNUM_KEYS = ["plantae", "animalia", "fungi"];

/** Агрегаты царств для «Кластеры-диаграммы» (тот же инструмент, что у локальных точек). */
const CLUSTER_REGNUM_PROPERTIES = Object.fromEntries(
  REGNUM_KEYS.map((regnum) => [
    regnum,
    ["+", ["case", ["==", ["get", "regnum"], regnum], 1, 0]]
  ])
);

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let interactionHandlers = null;
let onPointClickCallback = null;
let layerVisible = true;
let gbifClusteringEnabled = true;
let gbifClusterByRegnum = true;
let gbifClusterPieChartsEnabled = false;
let gbifDenseClustersHighlightEnabled = false;
let expandedGbifDensePileKeys = new Set();
/** Колбэк после раскрытия плотной группы GBIF (карта или список). */
let onGbifDensePileExpandedCallback = null;
/** Последняя FeatureCollection, переданная в setGbifData (с учётом фильтров). */
let lastGbifInputCollection = EMPTY_FEATURE_COLLECTION;
/** Ключи точек, скрытых под булавкой выделения / share. */
let hiddenPointFeatureKeys = [];

function isGbifMapboxClusteringActive() {
  return gbifClusteringEnabled && !gbifDenseClustersHighlightEnabled;
}

function getGbifSourceId(regnum = null) {
  return regnum ? `${GBIF_SOURCE_ID}-${regnum}` : GBIF_SOURCE_ID;
}

function getGbifLayerIds(regnum = null) {
  const suffix = regnum ? `-${regnum}` : "";
  return {
    clusters: `${GBIF_CLUSTER_LAYER_ID}${suffix}`,
    clusterCount: `${GBIF_CLUSTER_COUNT_LAYER_ID}${suffix}`,
    unclustered: `${GBIF_UNCLUSTERED_LAYER_ID}${suffix}`
  };
}

/** Все id источников GBIF в текущем режиме. */
export function getGbifSourceIds() {
  if (!isGbifMapboxClusteringActive()) {
    return [GBIF_SOURCE_ID];
  }

  if (gbifClusterByRegnum) {
    return REGNUM_KEYS.map((regnum) => getGbifSourceId(regnum));
  }

  return [GBIF_SOURCE_ID];
}

function getAllGbifClusterLayerIds() {
  const dense = gbifDenseClustersHighlightEnabled
    ? [GBIF_DENSE_PILES_CLUSTER_LAYER_ID]
    : [];

  if (!isGbifMapboxClusteringActive()) {
    return dense;
  }

  if (gbifClusterByRegnum) {
    return [
      ...REGNUM_KEYS.map((regnum) => getGbifLayerIds(regnum).clusters),
      ...dense
    ];
  }

  return [GBIF_CLUSTER_LAYER_ID, ...dense];
}

function getAllGbifUnclusteredLayerIds() {
  if (!isGbifMapboxClusteringActive()) {
    return [GBIF_UNCLUSTERED_LAYER_ID];
  }

  if (gbifClusterByRegnum) {
    return REGNUM_KEYS.map((regnum) => getGbifLayerIds(regnum).unclustered);
  }

  return [GBIF_UNCLUSTERED_LAYER_ID];
}

function getAllGbifLayerIds() {
  const dense = gbifDenseClustersHighlightEnabled
    ? [GBIF_DENSE_PILES_CLUSTER_LAYER_ID, GBIF_DENSE_PILES_COUNT_LAYER_ID]
    : [];

  if (!isGbifMapboxClusteringActive()) {
    return [GBIF_UNCLUSTERED_LAYER_ID, ...dense];
  }

  if (gbifClusterByRegnum) {
    return [
      ...REGNUM_KEYS.flatMap((regnum) => {
        const ids = getGbifLayerIds(regnum);
        return [ids.clusters, ids.clusterCount, ids.unclustered];
      }),
      ...dense
    ];
  }

  if (gbifClusterPieChartsEnabled) {
    return [GBIF_CLUSTER_LAYER_ID, GBIF_UNCLUSTERED_LAYER_ID, ...dense];
  }

  return [
    GBIF_CLUSTER_LAYER_ID,
    GBIF_CLUSTER_COUNT_LAYER_ID,
    GBIF_UNCLUSTERED_LAYER_ID,
    ...dense
  ];
}

/** Слои GBIF, по которым клик считается попаданием в точку/кластер. */
export function getGbifInteractiveLayerIds(map) {
  return [
    ...getAllGbifClusterLayerIds(),
    ...getAllGbifUnclusteredLayerIds()
  ].filter((layerId) => map?.getLayer(layerId));
}

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
  getAllGbifUnclusteredLayerIds().forEach((layerId) => {
    if (!map?.getLayer(layerId)) {
      return;
    }

    const parts = [];

    if (isGbifMapboxClusteringActive()) {
      parts.push(["!", ["has", "point_count"]]);
    }

    hiddenPointFeatureKeys.forEach((key) => {
      parts.push(buildPinnedKeyExclusion(key));
    });

    if (parts.length === 0) {
      map.setFilter(layerId, null);
      return;
    }

    map.setFilter(layerId, parts.length === 1 ? parts[0] : ["all", ...parts]);
  });
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

  const base = fromStore ?? {
    type: "Feature",
    id: rawFeature.id ?? (gbifKey != null ? `gbif-${gbifKey}` : undefined),
    geometry: rawFeature.geometry,
    properties: {
      ...rawFeature.properties,
      source: rawFeature.properties?.source ?? "gbif"
    }
  };

  const original =
    getFeatureCoordinates(rawFeature) ??
    getFeatureCoordinates(base) ??
    base.geometry?.coordinates;

  // Булавка/клик — на видимой (возможно разведённой) позиции;
  // в properties храним исходные координаты для share/инструментов.
  return {
    ...base,
    geometry: rawFeature.geometry ?? base.geometry,
    properties: {
      ...base.properties,
      ...(Array.isArray(original)
        ? { [COORDINATES_ORIGINAL_PROP]: original }
        : {})
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
    pointLeave,
    clusterLayerIds,
    unclusteredLayerIds
  } = interactionHandlers;

  (clusterLayerIds ?? []).forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }
    map.off("click", layerId, clusterClick);
    map.off("mouseenter", layerId, clusterEnter);
    map.off("mouseleave", layerId, clusterLeave);
  });

  (unclusteredLayerIds ?? []).forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }
    map.off("click", layerId, pointClick);
    map.off("mouseenter", layerId, pointEnter);
    map.off("mouseleave", layerId, pointLeave);
  });

  interactionHandlers = null;
}

function attachInteractions(map) {
  detachInteractions(map);

  const clusterLayerIds = getAllGbifClusterLayerIds().filter((id) => map.getLayer(id));
  const unclusteredLayerIds = getAllGbifUnclusteredLayerIds().filter((id) =>
    map.getLayer(id)
  );

  const clusterClick = (event) => {
    const features = map.queryRenderedFeatures(event.point, {
      layers: clusterLayerIds
    });
    const feature = features[0];

    if (feature?.properties?.dense_pile) {
      const key = feature.properties.dense_pile_key;
      if (!key) {
        return;
      }

      expandGbifDensePileByKey(map, key, {
        coordinates: feature.geometry?.coordinates,
        pointCount: feature.properties?.point_count
      });
      return;
    }

    const clusterId = feature?.properties?.cluster_id;
    const sourceId = feature?.source;
    const source = sourceId ? map.getSource(sourceId) : null;

    if (clusterId == null || !source?.getClusterExpansionZoom) {
      return;
    }

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

    // Не даём клику «провалиться» в map-background clear (локальный mapClick).
    event.preventDefault?.();
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

  clusterLayerIds.forEach((layerId) => {
    map.on("click", layerId, clusterClick);
    map.on("mouseenter", layerId, clusterEnter);
    map.on("mouseleave", layerId, clusterLeave);
  });

  unclusteredLayerIds.forEach((layerId) => {
    map.on("click", layerId, pointClick);
    map.on("mouseenter", layerId, pointEnter);
    map.on("mouseleave", layerId, pointLeave);
  });

  interactionHandlers = {
    clusterClick,
    clusterEnter,
    clusterLeave,
    pointClick,
    pointEnter,
    pointLeave,
    clusterLayerIds,
    unclusteredLayerIds
  };
}

function applyVisibility(map) {
  const visibility = layerVisible ? "visible" : "none";

  getAllGbifLayerIds().forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function removeGbifFromMap(map) {
  detachInteractions(map);

  const style = map.getStyle();
  if (!style?.layers) {
    return;
  }

  removeDensePilesLayers(map, {
    sourceId: GBIF_DENSE_PILES_SOURCE_ID,
    clusterLayerId: GBIF_DENSE_PILES_CLUSTER_LAYER_ID,
    countLayerId: GBIF_DENSE_PILES_COUNT_LAYER_ID
  });

  const sourceIds = new Set([
    GBIF_SOURCE_ID,
    ...REGNUM_KEYS.map((regnum) => getGbifSourceId(regnum))
  ]);

  style.layers
    .filter((layer) => sourceIds.has(layer.source))
    .map((layer) => layer.id)
    .forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

  sourceIds.forEach((sourceId) => {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  });
}

function addUnclusteredGbifLayer(map, sourceId, layerId, regnum = null) {
  map.addLayer({
    id: layerId,
    type: "circle",
    source: sourceId,
    ...(isGbifMapboxClusteringActive()
      ? { filter: ["!", ["has", "point_count"]] }
      : {}),
    paint: {
      "circle-color": regnum
        ? getPointColorForRegnum(regnum)
        : getPointColorExpression(),
      "circle-radius": MARKER_RADIUS,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });
}

function addClusterGbifLayers(map, sourceId, layerIds, regnum = null) {
  const usePieCharts = gbifClusterPieChartsEnabled && !regnum;

  map.addLayer({
    id: layerIds.clusters,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: getGbifClusterPaint(regnum)
  });

  if (!usePieCharts) {
    map.addLayer({
      id: layerIds.clusterCount,
      type: "symbol",
      source: sourceId,
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

  addUnclusteredGbifLayer(map, sourceId, layerIds.unclustered, regnum);
}

function prepareMapGbifFeatures(features) {
  if (!gbifDenseClustersHighlightEnabled) {
    // При обычной Mapbox-кластеризации совпадения схлопываются в кластер —
    // spiral spread здесь лишний и дорогой.
    return {
      mapFeatures: isGbifMapboxClusteringActive()
        ? features
        : spreadCoincidentFeatures(features),
      denseClusterFeatures: []
    };
  }

  const { expandedDenseFeatures, denseClusterFeatures } = partitionFeaturesByDensePiles(
    features,
    {
      expandedPileKeys: expandedGbifDensePileKeys
    }
  );

  return {
    // Точки вне сверхплотных куч не показываем; раскрытые кучи — отдельными маркерами.
    mapFeatures: spreadCoincidentFeatures(expandedDenseFeatures),
    denseClusterFeatures
  };
}

function getGbifClusterPaint(regnum = null) {
  const clusterColor = regnum
    ? REGNUM_COLORS[regnum] ?? DEFAULT_CLUSTER_COLOR
    : DEFAULT_CLUSTER_COLOR;
  const usePieCharts = gbifClusterPieChartsEnabled && !regnum;

  if (usePieCharts) {
    return {
      "circle-color": "#000000",
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32],
      "circle-stroke-width": 0,
      "circle-opacity": 0,
      "circle-stroke-opacity": 0
    };
  }

  return {
    "circle-color": clusterColor,
    "circle-radius": ["step", ["get", "point_count"], 16, 50, 20, 200, 26],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 1,
    "circle-stroke-opacity": 1
  };
}

function syncGbifDensePilesLayers(map, denseClusterFeatures) {
  if (!gbifDenseClustersHighlightEnabled) {
    removeDensePilesLayers(map, {
      sourceId: GBIF_DENSE_PILES_SOURCE_ID,
      clusterLayerId: GBIF_DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: GBIF_DENSE_PILES_COUNT_LAYER_ID
    });
    return;
  }

  const visibility = layerVisible ? "visible" : "none";

  if (!map.getSource(GBIF_DENSE_PILES_SOURCE_ID)) {
    ensureDensePilesLayers(map, {
      sourceId: GBIF_DENSE_PILES_SOURCE_ID,
      clusterLayerId: GBIF_DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: GBIF_DENSE_PILES_COUNT_LAYER_ID,
      features: denseClusterFeatures,
      visibility
    });
    return;
  }

  setDensePilesData(map, GBIF_DENSE_PILES_SOURCE_ID, denseClusterFeatures);
  [GBIF_DENSE_PILES_CLUSTER_LAYER_ID, GBIF_DENSE_PILES_COUNT_LAYER_ID].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    }
  );
}

function rebuildGbifLayers(map) {
  if (!map?.getStyle()) {
    return;
  }

  const collection = getGbifFeatureCollection();
  const { mapFeatures, denseClusterFeatures } = prepareMapGbifFeatures(
    collection.features ?? []
  );
  removeGbifFromMap(map);

  if (!isGbifMapboxClusteringActive()) {
    map.addSource(GBIF_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: mapFeatures }
    });
    addUnclusteredGbifLayer(map, GBIF_SOURCE_ID, GBIF_UNCLUSTERED_LAYER_ID);
  } else if (gbifClusterByRegnum) {
    REGNUM_KEYS.forEach((regnum) => {
      const sourceId = getGbifSourceId(regnum);
      const features = mapFeatures.filter(
        (feature) => feature.properties?.regnum === regnum
      );

      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
        cluster: true,
        ...CLUSTER_OPTIONS
      });

      addClusterGbifLayers(map, sourceId, getGbifLayerIds(regnum), regnum);
    });

    // Точки без regnum — в общий независящий от царства источник.
    const otherFeatures = mapFeatures.filter(
      (feature) => !REGNUM_KEYS.includes(feature.properties?.regnum)
    );
    if (otherFeatures.length > 0) {
      map.addSource(GBIF_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: otherFeatures },
        cluster: true,
        ...CLUSTER_OPTIONS
      });
      addClusterGbifLayers(map, GBIF_SOURCE_ID, {
        clusters: GBIF_CLUSTER_LAYER_ID,
        clusterCount: GBIF_CLUSTER_COUNT_LAYER_ID,
        unclustered: GBIF_UNCLUSTERED_LAYER_ID
      });
    }
  } else {
    map.addSource(GBIF_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: mapFeatures },
      cluster: true,
      ...CLUSTER_OPTIONS,
      clusterProperties: {
        ...(gbifClusterPieChartsEnabled ? CLUSTER_REGNUM_PROPERTIES : {})
      }
    });
    addClusterGbifLayers(map, GBIF_SOURCE_ID, {
      clusters: GBIF_CLUSTER_LAYER_ID,
      clusterCount: GBIF_CLUSTER_COUNT_LAYER_ID,
      unclustered: GBIF_UNCLUSTERED_LAYER_ID
    });
  }

  syncGbifDensePilesLayers(map, denseClusterFeatures);
  attachInteractions(map);
  applyVisibility(map);
  applyGbifUnclusteredFilter(map);
}

/**
 * Создаёт отдельный слой точек GBIF (кластеризация; цвета как у локальных точек).
 * Данные берутся из gbifStore; повторный вызов безопасен.
 */
export function addGbifLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }

  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }

  const hasAnySource = getGbifSourceIds().some((sourceId) => map.getSource(sourceId))
    || map.getSource(GBIF_SOURCE_ID);

  if (hasAnySource) {
    setGbifData(map, getGbifFeatureCollection());
    if (!interactionHandlers) {
      attachInteractions(map);
    }
    applyVisibility(map);
    applyGbifUnclusteredFilter(map);
    return;
  }

  rebuildGbifLayers(map);
}

/** Обновляет GeoJSON источников GBIF. */
export function setGbifData(map, collection) {
  if (!map) {
    return;
  }

  const data = collection?.type === "FeatureCollection" ? collection : EMPTY_FEATURE_COLLECTION;
  lastGbifInputCollection = data;
  const { mapFeatures, denseClusterFeatures } = prepareMapGbifFeatures(data.features ?? []);
  const hasSource = getGbifSourceIds().some((sourceId) => map.getSource(sourceId))
    || map.getSource(GBIF_SOURCE_ID);

  if (!hasSource) {
    addGbifLayer(map);
  }

  if (!isGbifMapboxClusteringActive()) {
    map.getSource(GBIF_SOURCE_ID)?.setData({
      type: "FeatureCollection",
      features: mapFeatures
    });
  } else if (gbifClusterByRegnum) {
    REGNUM_KEYS.forEach((regnum) => {
      const source = map.getSource(getGbifSourceId(regnum));
      if (!source) {
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: mapFeatures.filter(
          (feature) => feature.properties?.regnum === regnum
        )
      });
    });

    const otherSource = map.getSource(GBIF_SOURCE_ID);
    if (otherSource) {
      otherSource.setData({
        type: "FeatureCollection",
        features: mapFeatures.filter(
          (feature) => !REGNUM_KEYS.includes(feature.properties?.regnum)
        )
      });
    }
  } else {
    map.getSource(GBIF_SOURCE_ID)?.setData({
      type: "FeatureCollection",
      features: mapFeatures
    });
  }

  syncGbifDensePilesLayers(map, denseClusterFeatures);
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
    // Чтобы «Кластеры-диаграммы» сразу убрали/вернули SVG по слою GBIF.
    map.triggerRepaint?.();
  }
}

export function isGbifLayerVisible() {
  return layerVisible;
}

/** Включает/выключает кластеризацию слоя GBIF. */
export function setGbifClusteringEnabled(map, enabled) {
  const next = Boolean(enabled);
  if (gbifClusteringEnabled === next) {
    return;
  }

  gbifClusteringEnabled = next;
  if (map) {
    rebuildGbifLayers(map);
  }
}

/** Группировка кластеров GBIF по царству (отдельные источники). */
export function setGbifClusterByRegnum(map, enabled) {
  const next = Boolean(enabled);
  if (gbifClusterByRegnum === next) {
    return;
  }

  gbifClusterByRegnum = next;
  if (map && isGbifMapboxClusteringActive()) {
    rebuildGbifLayers(map);
  }
}

/** Включает/выключает «Кластеры-диаграммы» для слоя GBIF (тот же режим, что у локальных точек). */
export function setGbifClusterPieChartsEnabled(map, enabled) {
  const next = Boolean(enabled);
  if (gbifClusterPieChartsEnabled === next) {
    return;
  }

  gbifClusterPieChartsEnabled = next;
  if (map && isGbifMapboxClusteringActive()) {
    rebuildGbifLayers(map);
  }
}

export function isGbifClusteringEnabled() {
  return gbifClusteringEnabled;
}

export function isGbifClusterByRegnumEnabled() {
  return gbifClusterByRegnum;
}

export function isGbifClusterPieChartsEnabled() {
  return gbifClusterPieChartsEnabled;
}

/** Сверхплотные кластеры GBIF: без обычной кластеризации, только кучи ≥10. */
export function setGbifDenseClustersHighlightEnabled(map, enabled) {
  const next = Boolean(enabled);
  if (gbifDenseClustersHighlightEnabled === next) {
    return;
  }

  gbifDenseClustersHighlightEnabled = next;
  expandedGbifDensePileKeys = new Set();
  if (map) {
    rebuildGbifLayers(map);
  }
}

export function isGbifDenseClustersHighlightEnabled() {
  return gbifDenseClustersHighlightEnabled;
}

/**
 * Раскрывает плотную группу GBIF по ключу координат и зумирует к разведённым точкам.
 */
export function expandGbifDensePileByKey(
  map,
  key,
  {
    coordinates = null,
    pointCount = null,
    animateCamera = true,
    notify = true
  } = {}
) {
  if (!map?.getStyle?.() || !key || !gbifDenseClustersHighlightEnabled) {
    return;
  }

  expandedGbifDensePileKeys.add(key);
  setGbifData(map, lastGbifInputCollection);

  const center =
    Array.isArray(coordinates) && coordinates.length >= 2 ? coordinates : null;
  const count = Number(pointCount) || 1;

  if (animateCamera && center) {
    const bounds = getSpreadPileFitBounds(center, count);
    if (bounds && count > 1) {
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 18,
        duration: 900
      });
    } else {
      map.easeTo({
        center,
        zoom: Math.max(map.getZoom(), 15)
      });
    }
  }

  if (notify && typeof onGbifDensePileExpandedCallback === "function") {
    onGbifDensePileExpandedCallback({
      key,
      coordinates: center,
      pointCount: count
    });
  }
}

/** Регистрирует обработчик раскрытия плотной группы GBIF. */
export function setGbifDensePileExpandedHandler(handler) {
  onGbifDensePileExpandedCallback = handler ?? null;
}

/** Задаёт обработчик клика по точке GBIF (панель «Сведения о точке»). */
export function setGbifPointClickHandler(handler) {
  onPointClickCallback = handler ?? null;
}
