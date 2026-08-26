import { findInatFeatureById, getInatSlimMapCollection } from "../inaturalist/inatStore";
import { shouldSuppressLoadedPointLayers } from "../map/regionLoadSummary";
import { buildCompactInatViewportFeatures } from "../map/compactInatViewport";
import {
  addCompactGridLayers,
  compactCircleRadiusExpression,
  compactDensityFalseFilter,
  compactGridLayerIds,
  easeToCompactDensityCell,
  ensureCompactViewportSync,
  isCompactDensityFeature,
  isCompactPointDisplayEnabled
} from "../map/compactPointDisplay";
import {
  DEFAULT_CLUSTER_COLOR,
  REGNUM_COLORS,
  getPointColorExpression,
  getPointColorForRegnum
} from "./pointColors";
import {
  INAT_DENSE_PILES_CLUSTER_LAYER_ID,
  INAT_DENSE_PILES_COUNT_LAYER_ID,
  INAT_DENSE_PILES_SOURCE_ID,
  ensureDensePilesLayers,
  partitionFeaturesByDensePiles,
  removeDensePilesLayers,
  setDensePilesData
} from "./densePiles";
import {
  COORDINATES_ORIGINAL_PROP,
  fitMapToCoincidentSpread,
  getCoincidentCoordKeys,
  getFeatureCoordinates,
  getSpreadPileFitBounds,
  restoreOriginalCoordinates,
  spreadCoincidentFeatures
} from "./spreadCoincidentPoints";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";
import {
  cancelClusterHoverRequest,
  removePointHoverPopup,
  showClusterRegnumHover
} from "./pointHoverTooltips";
import { slimMapFeatures } from "./mapPerformance";
import "../styles/GbifPanel.css";

export const INAT_SOURCE_ID = "inat-locations";
export const INAT_CLUSTER_LAYER_ID = "inat-clusters";
export const INAT_CLUSTER_COUNT_LAYER_ID = "inat-cluster-count";
export const INAT_UNCLUSTERED_LAYER_ID = "inat-unclustered";

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

const MARKER_RADIUS = 5;
const REGNUM_KEYS = ["plantae", "animalia", "fungi", "protozoa"];

/** Агрегаты царств для «Кластеры-диаграммы» (тот же инструмент, что у локальных точек). */
const CLUSTER_REGNUM_PROPERTIES = Object.fromEntries(
  REGNUM_KEYS.map((regnum) => [
    regnum,
    [
      "+",
      [
        "case",
        ["==", ["downcase", ["coalesce", ["get", "regnum"], ""]], regnum],
        1,
        0
      ]
    ]
  ])
);

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let interactionHandlers = null;
let onPointClickCallback = null;
/** По умолчанию скрыт — показывается только в режиме «Внешние источники». */
let layerVisible = false;
let inatClusteringEnabled = true;
let inatClusterByRegnum = false;
let inatClusterPieChartsEnabled = false;
let inatDenseClustersHighlightEnabled = false;
let expandedInatDensePileKeys = new Set();
/** Члены сверхплотных кластеров: id → features[]. */
let inatDensePileMembers = new Map();
/** Ключи lng,lat совпадающих точек, разведённых по клику на обычный кластер. */
let expandedInatCoincidentKeys = new Set();
/** Колбэк после раскрытия плотной группы iNat (карта или список). */
let onInatDensePileExpandedCallback = null;
/** Последняя FeatureCollection, переданная в setInatData (с учётом фильтров). */
let lastInatInputCollection = EMPTY_FEATURE_COLLECTION;
/** Пока идёт загрузка датасета — не рисуем точки на карте. */
let inatMapUpdatesPaused = false;
/** Ключи точек, скрытых под булавкой выделения / share. */
let hiddenPointFeatureKeys = [];

function getInatFeatureStableKey(feature) {
  if (feature?.id != null && feature.id !== "") {
    return String(feature.id);
  }

  const inatId = feature?.properties?.inat_id;
  if (inatId != null && inatId !== "") {
    return `inat-${inatId}`;
  }

  return "";
}

function excludeInatHiddenPinFeatures(features) {
  if (!hiddenPointFeatureKeys.length) {
    return features;
  }

  const hidden = new Set(hiddenPointFeatureKeys.map(String));
  return (features ?? []).filter((feature) => {
    const key = getInatFeatureStableKey(feature);
    return !key || !hidden.has(key);
  });
}

function getInatDensePileMembers(feature) {
  const key = feature?.properties?.dense_pile_key;
  if (!key) {
    return [];
  }

  return inatDensePileMembers.get(`dense-${key}`) ?? [];
}

function isInatMapboxClusteringActive() {
  if (isCompactPointDisplayEnabled()) {
    return false;
  }
  return inatClusteringEnabled && !inatDenseClustersHighlightEnabled;
}

function getInatSourceId(regnum = null) {
  return regnum ? `${INAT_SOURCE_ID}-${regnum}` : INAT_SOURCE_ID;
}

function getInatLayerIds(regnum = null) {
  const suffix = regnum ? `-${regnum}` : "";
  return {
    clusters: `${INAT_CLUSTER_LAYER_ID}${suffix}`,
    clusterCount: `${INAT_CLUSTER_COUNT_LAYER_ID}${suffix}`,
    unclustered: `${INAT_UNCLUSTERED_LAYER_ID}${suffix}`
  };
}

/** Все id источников iNat в текущем режиме. */
export function getInatSourceIds() {
  if (!isInatMapboxClusteringActive()) {
    return [INAT_SOURCE_ID];
  }

  if (inatClusterByRegnum) {
    // Базовый источник — точки без regnum (или с неизвестным царством).
    return [...REGNUM_KEYS.map((regnum) => getInatSourceId(regnum)), INAT_SOURCE_ID];
  }

  return [INAT_SOURCE_ID];
}

function getAllInatClusterLayerIds() {
  const dense = inatDenseClustersHighlightEnabled
    ? [INAT_DENSE_PILES_CLUSTER_LAYER_ID]
    : [];

  if (!isInatMapboxClusteringActive()) {
    return dense;
  }

  if (inatClusterByRegnum) {
    return [
      ...REGNUM_KEYS.map((regnum) => getInatLayerIds(regnum).clusters),
      INAT_CLUSTER_LAYER_ID,
      ...dense
    ];
  }

  return [INAT_CLUSTER_LAYER_ID, ...dense];
}

function getAllInatUnclusteredLayerIds() {
  if (!isInatMapboxClusteringActive()) {
    return [INAT_UNCLUSTERED_LAYER_ID];
  }

  if (inatClusterByRegnum) {
    return [
      ...REGNUM_KEYS.map((regnum) => getInatLayerIds(regnum).unclustered),
      INAT_UNCLUSTERED_LAYER_ID
    ];
  }

  return [INAT_UNCLUSTERED_LAYER_ID];
}

function getAllInatCompactGridLayerIds() {
  return getInatSourceIds().flatMap((sourceId) => {
    const { fillId, lineId } = compactGridLayerIds(sourceId);
    return [fillId, lineId];
  });
}

function getInatPointClickLayerIds() {
  return getAllInatUnclusteredLayerIds();
}

function getAllInatLayerIds() {
  const dense = inatDenseClustersHighlightEnabled
    ? [INAT_DENSE_PILES_CLUSTER_LAYER_ID, INAT_DENSE_PILES_COUNT_LAYER_ID]
    : [];
  const grid = getAllInatCompactGridLayerIds();

  if (!isInatMapboxClusteringActive()) {
    return [INAT_UNCLUSTERED_LAYER_ID, ...grid, ...dense];
  }

  if (inatClusterByRegnum) {
    return [
      ...REGNUM_KEYS.flatMap((regnum) => {
        const ids = getInatLayerIds(regnum);
        return [ids.clusters, ids.clusterCount, ids.unclustered];
      }),
      INAT_CLUSTER_LAYER_ID,
      INAT_CLUSTER_COUNT_LAYER_ID,
      INAT_UNCLUSTERED_LAYER_ID,
      ...grid,
      ...dense
    ];
  }

  if (inatClusterPieChartsEnabled) {
    return [INAT_CLUSTER_LAYER_ID, INAT_UNCLUSTERED_LAYER_ID, ...grid, ...dense];
  }

  return [
    INAT_CLUSTER_LAYER_ID,
    INAT_CLUSTER_COUNT_LAYER_ID,
    INAT_UNCLUSTERED_LAYER_ID,
    ...grid,
    ...dense
  ];
}

/** Слои iNat, по которым клик считается попаданием в точку/кластер. */
export function getInatInteractiveLayerIds(map) {
  return [
    ...getAllInatClusterLayerIds(),
    ...getInatPointClickLayerIds()
  ].filter((layerId) => map?.getLayer(layerId));
}

/** Выражение Mapbox: скрыть feature, совпадающий с ключом булавки. */
function buildInatPinnedKeyExclusion(key) {
  return [
    "!",
    [
      "any",
      ["==", ["to-string", ["id"]], key],
      ["==", ["to-string", ["coalesce", ["get", "finding_id"], ""]], key],
      ["==", ["to-string", ["coalesce", ["get", "inat_id"], ""]], key],
      [
        "==",
        ["concat", "inat-", ["to-string", ["coalesce", ["get", "inat_id"], ""]]],
        key
      ]
    ]
  ];
}

function applyInatUnclusteredFilter(map) {
  getAllInatUnclusteredLayerIds().forEach((layerId) => {
    if (!map?.getLayer(layerId)) {
      return;
    }

    const parts = [compactDensityFalseFilter()];

    if (isInatMapboxClusteringActive()) {
      parts.push(["!", ["has", "point_count"]]);
    }

    hiddenPointFeatureKeys.forEach((key) => {
      parts.push(buildInatPinnedKeyExclusion(key));
    });

    map.setFilter(layerId, parts.length === 1 ? parts[0] : ["all", ...parts]);
  });
}

/**
 * Скрывает обычные маркеры iNat для точек, показанных булавкой
 * (выделение в «Сведения о точке» или share-ссылка).
 */
export function setInatHiddenPointFeatureKeys(map, keys) {
  hiddenPointFeatureKeys = [...new Set((keys ?? []).filter(Boolean).map(String))];
  if (!map) {
    return;
  }

  // Надёжнее убрать точку из GeoJSON (фильтр слоя на clustered source иногда не срабатывает).
  if (lastInatInputCollection) {
    setInatData(map, lastInatInputCollection);
    return;
  }

  applyInatUnclusteredFilter(map);
}

function resolveClickedFeature(rawFeature) {
  const inatKey = rawFeature?.properties?.inat_id;
  const fromStore = findInatFeatureById(inatKey);

  const base = fromStore ?? {
    type: "Feature",
    id: rawFeature.id ?? (inatKey != null ? `inat-${inatKey}` : undefined),
    geometry: rawFeature.geometry,
    properties: {
      ...rawFeature.properties,
      source: rawFeature.properties?.source ?? "inat"
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

  const clusterLayerIds = getAllInatClusterLayerIds().filter((id) => map.getLayer(id));
  const unclusteredLayerIds = getInatPointClickLayerIds().filter((id) =>
    map.getLayer(id)
  );

  const clusterClick = (event) => {
    const features = safeQueryRenderedFeatures(map, event.point, {
      layers: clusterLayerIds
    });
    const feature = features[0];

    if (feature?.properties?.dense_pile) {
      const key = feature.properties.dense_pile_key;
      if (!key) {
        return;
      }

      expandInatDensePileByKey(map, key, {
        coordinates: feature.geometry?.coordinates,
        pointCount: feature.properties?.point_count
      });
      return;
    }

    const clusterId = feature?.properties?.cluster_id;
    const sourceId = feature?.source;
    const source = sourceId ? map.getSource(sourceId) : null;

    if (clusterId == null || !source?.getClusterLeaves || !source?.getClusterExpansionZoom) {
      return;
    }

    source.getClusterLeaves(clusterId, Infinity, 0, (leavesErr, leaves) => {
      if (leavesErr) {
        return;
      }

      const restoredLeaves = (leaves ?? []).map(restoreOriginalCoordinates);
      const coincidentKeys = getCoincidentCoordKeys(restoredLeaves);

      if (coincidentKeys.size > 0) {
        coincidentKeys.forEach((key) => expandedInatCoincidentKeys.add(key));
        setInatData(map, lastInatInputCollection);
        fitMapToCoincidentSpread(map, restoredLeaves);
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
    });
  };

  const clusterEnter = (event) => {
    map.getCanvas().style.cursor = "pointer";
    showClusterRegnumHover(map, event, {
      getDensePileLeaves: getInatDensePileMembers
    });
  };

  const clusterLeave = () => {
    map.getCanvas().style.cursor = "";
    cancelClusterHoverRequest();
    removePointHoverPopup();
  };

  const pointClick = (event) => {
    const rawFeature = event.features?.[0];
    if (!rawFeature) {
      return;
    }

    // Не даём клику «провалиться» в map-background clear (локальный mapClick).
    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();

    if (isCompactDensityFeature(rawFeature)) {
      easeToCompactDensityCell(map, rawFeature);
      return;
    }

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

function inatSourceLayoutMatchesMode(map) {
  if (!map?.getSource) {
    return false;
  }

  const hasRegnumSource = REGNUM_KEYS.some((regnum) =>
    Boolean(map.getSource(getInatSourceId(regnum)))
  );
  const hasBaseSource = Boolean(map.getSource(INAT_SOURCE_ID));

  if (!isInatMapboxClusteringActive()) {
    return hasBaseSource && !hasRegnumSource;
  }

  if (inatClusterByRegnum) {
    return REGNUM_KEYS.every((regnum) =>
      Boolean(map.getSource(getInatSourceId(regnum)))
    );
  }

  return hasBaseSource && !hasRegnumSource;
}

function applyVisibility(map) {
  const visibility = layerVisible ? "visible" : "none";

  getAllInatLayerIds().forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function removeInatFromMap(map) {
  detachInteractions(map);

  const style = map.getStyle();
  if (!style?.layers) {
    return;
  }

  removeDensePilesLayers(map, {
    sourceId: INAT_DENSE_PILES_SOURCE_ID,
    clusterLayerId: INAT_DENSE_PILES_CLUSTER_LAYER_ID,
    countLayerId: INAT_DENSE_PILES_COUNT_LAYER_ID
  });

  const sourceIds = new Set([
    INAT_SOURCE_ID,
    ...REGNUM_KEYS.map((regnum) => getInatSourceId(regnum))
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

function addUnclusteredInatLayer(map, sourceId, layerId, regnum = null) {
  map.addLayer({
    id: layerId,
    type: "circle",
    source: sourceId,
    filter: isInatMapboxClusteringActive()
      ? ["all", compactDensityFalseFilter(), ["!", ["has", "point_count"]]]
      : compactDensityFalseFilter(),
    paint: {
      "circle-color": regnum
        ? getPointColorForRegnum(regnum)
        : getPointColorExpression(),
      "circle-radius": compactCircleRadiusExpression(MARKER_RADIUS),
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });
  if (map.getSource(sourceId)) {
    addCompactGridLayers(map, sourceId);
  }
}

function addClusterInatLayers(map, sourceId, layerIds, regnum = null) {
  const usePieCharts = inatClusterPieChartsEnabled && !regnum;

  map.addLayer({
    id: layerIds.clusters,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: getInatClusterPaint(regnum)
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

  addUnclusteredInatLayer(map, sourceId, layerIds.unclustered, regnum);
}

function prepareMapInatFeatures(features) {
  if (!inatDenseClustersHighlightEnabled) {
    // При обычной Mapbox-кластеризации spread только для раскрытых по клику куч;
    // без кластеризации — полный spiral spread.
    inatDensePileMembers = new Map();
    return {
      mapFeatures: isInatMapboxClusteringActive()
        ? spreadCoincidentFeatures(features, expandedInatCoincidentKeys)
        : spreadCoincidentFeatures(features),
      denseClusterFeatures: []
    };
  }

  const { expandedDenseFeatures, denseClusterFeatures, densePileMembersById } =
    partitionFeaturesByDensePiles(features, {
      expandedPileKeys: expandedInatDensePileKeys
    });

  inatDensePileMembers = densePileMembersById;

  return {
    // Точки вне сверхплотных куч не показываем; раскрытые кучи — отдельными маркерами.
    mapFeatures: spreadCoincidentFeatures(expandedDenseFeatures),
    denseClusterFeatures
  };
}

function getInatClusterPaint(regnum = null) {
  const clusterColor = regnum
    ? REGNUM_COLORS[regnum] ?? DEFAULT_CLUSTER_COLOR
    : DEFAULT_CLUSTER_COLOR;
  const usePieCharts = inatClusterPieChartsEnabled && !regnum;

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

function syncInatDensePilesLayers(map, denseClusterFeatures) {
  if (!inatDenseClustersHighlightEnabled) {
    removeDensePilesLayers(map, {
      sourceId: INAT_DENSE_PILES_SOURCE_ID,
      clusterLayerId: INAT_DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: INAT_DENSE_PILES_COUNT_LAYER_ID
    });
    return;
  }

  const visibility = layerVisible ? "visible" : "none";

  if (!map.getSource(INAT_DENSE_PILES_SOURCE_ID)) {
    ensureDensePilesLayers(map, {
      sourceId: INAT_DENSE_PILES_SOURCE_ID,
      clusterLayerId: INAT_DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: INAT_DENSE_PILES_COUNT_LAYER_ID,
      features: denseClusterFeatures,
      visibility
    });
    return;
  }

  setDensePilesData(map, INAT_DENSE_PILES_SOURCE_ID, denseClusterFeatures);
  [INAT_DENSE_PILES_CLUSTER_LAYER_ID, INAT_DENSE_PILES_COUNT_LAYER_ID].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    }
  );
}

function bindInatCompactSync(map) {
  ensureCompactViewportSync(map, "inat", () => {
    if (!isCompactPointDisplayEnabled() || inatMapUpdatesPaused || shouldSuppressLoadedPointLayers()) {
      return;
    }
    setInatData(map, lastInatInputCollection);
  });
}

function getInatPreparedForMap(map, options = {}) {
  if (shouldSuppressLoadedPointLayers() && !options.preview) {
    return {
      mapFeatures: [],
      denseClusterFeatures: []
    };
  }

  if (isCompactPointDisplayEnabled() && !options.preview) {
    bindInatCompactSync(map);
    return {
      mapFeatures: buildCompactInatViewportFeatures(map).features,
      denseClusterFeatures: []
    };
  }

  const collection =
    lastInatInputCollection?.type === "FeatureCollection"
      ? lastInatInputCollection
      : getInatSlimMapCollection();
  if (options.preview) {
    return {
      mapFeatures: spreadCoincidentFeatures(collection.features ?? []),
      denseClusterFeatures: []
    };
  }
  return prepareMapInatFeatures(collection.features ?? []);
}

function rebuildInatLayers(map) {
  if (!map?.getStyle()) {
    return;
  }

  const { mapFeatures, denseClusterFeatures } = getInatPreparedForMap(map);
  const renderFeatures = slimMapFeatures(excludeInatHiddenPinFeatures(mapFeatures));
  removeInatFromMap(map);

  if (!isInatMapboxClusteringActive()) {
    map.addSource(INAT_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: renderFeatures }
    });
    addUnclusteredInatLayer(map, INAT_SOURCE_ID, INAT_UNCLUSTERED_LAYER_ID);
  } else if (inatClusterByRegnum) {
    REGNUM_KEYS.forEach((regnum) => {
      const sourceId = getInatSourceId(regnum);
      const features = renderFeatures.filter(
        (feature) =>
          String(feature.properties?.regnum || "").toLowerCase() === regnum
      );

      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
        cluster: true,
        ...CLUSTER_OPTIONS
      });

      addClusterInatLayers(map, sourceId, getInatLayerIds(regnum), regnum);
    });

    // Точки без regnum — в общий независящий от царства источник.
    const otherFeatures = renderFeatures.filter(
      (feature) =>
        !REGNUM_KEYS.includes(String(feature.properties?.regnum || "").toLowerCase())
    );
    if (otherFeatures.length > 0) {
      map.addSource(INAT_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: otherFeatures },
        cluster: true,
        ...CLUSTER_OPTIONS
      });
      addClusterInatLayers(map, INAT_SOURCE_ID, {
        clusters: INAT_CLUSTER_LAYER_ID,
        clusterCount: INAT_CLUSTER_COUNT_LAYER_ID,
        unclustered: INAT_UNCLUSTERED_LAYER_ID
      });
    }
  } else {
    map.addSource(INAT_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: renderFeatures },
      cluster: true,
      ...CLUSTER_OPTIONS,
      clusterProperties: {
        ...(inatClusterPieChartsEnabled ? CLUSTER_REGNUM_PROPERTIES : {})
      }
    });
    addClusterInatLayers(map, INAT_SOURCE_ID, {
      clusters: INAT_CLUSTER_LAYER_ID,
      clusterCount: INAT_CLUSTER_COUNT_LAYER_ID,
      unclustered: INAT_UNCLUSTERED_LAYER_ID
    });
  }

  syncInatDensePilesLayers(map, denseClusterFeatures);
  attachInteractions(map);
  applyVisibility(map);
  applyInatUnclusteredFilter(map);
}

/**
 * Создаёт отдельный слой точек iNat (кластеризация; цвета как у локальных точек).
 * Данные берутся из inatStore; повторный вызов безопасен.
 */
export function addInatLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }

  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }

  const hasAnySource = getInatSourceIds().some((sourceId) => map.getSource(sourceId))
    || map.getSource(INAT_SOURCE_ID);

  if (hasAnySource) {
    setInatData(map, getInatSlimMapCollection());
    if (!interactionHandlers) {
      attachInteractions(map);
    }
    applyVisibility(map);
    applyInatUnclusteredFilter(map);
    return;
  }

  rebuildInatLayers(map);
}

/** Пока идёт загрузка — слой не принимает новые точки (кроме явного ignorePause). */
export function setInatMapUpdatesPaused(paused) {
  inatMapUpdatesPaused = Boolean(paused);
}

/** Обновляет GeoJSON источников iNat. */
export function setInatData(map, collection, options = {}) {
  if (!map) {
    return;
  }

  if (inatMapUpdatesPaused && !options.ignorePause) {
    return;
  }

  const data = collection?.type === "FeatureCollection" ? collection : EMPTY_FEATURE_COLLECTION;
  if (!isCompactPointDisplayEnabled() || options.preview) {
    lastInatInputCollection = data;
  }
  const { mapFeatures, denseClusterFeatures } = options.preview
    ? {
        mapFeatures: spreadCoincidentFeatures(data.features ?? []),
        denseClusterFeatures: []
      }
    : getInatPreparedForMap(map, options);
  const preparedFeatures = options.preview
    ? mapFeatures
    : excludeInatHiddenPinFeatures(mapFeatures);
  const renderFeatures = slimMapFeatures(preparedFeatures);

  if (!options.preview && !inatSourceLayoutMatchesMode(map)) {
    rebuildInatLayers(map);
    return;
  }

  if (!isInatMapboxClusteringActive()) {
    map.getSource(INAT_SOURCE_ID)?.setData({
      type: "FeatureCollection",
      features: renderFeatures
    });
  } else if (inatClusterByRegnum) {
    REGNUM_KEYS.forEach((regnum) => {
      const source = map.getSource(getInatSourceId(regnum));
      if (!source) {
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: renderFeatures.filter(
          (feature) =>
          String(feature.properties?.regnum || "").toLowerCase() === regnum
        )
      });
    });

    const otherSource = map.getSource(INAT_SOURCE_ID);
    if (otherSource) {
      otherSource.setData({
        type: "FeatureCollection",
        features: renderFeatures.filter(
          (feature) =>
        !REGNUM_KEYS.includes(String(feature.properties?.regnum || "").toLowerCase())
        )
      });
    }
  } else {
    map.getSource(INAT_SOURCE_ID)?.setData({
      type: "FeatureCollection",
      features: renderFeatures
    });
  }

  syncInatDensePilesLayers(map, denseClusterFeatures);
  applyInatUnclusteredFilter(map);
}

/** Очищает точки iNat на карте (источник остаётся). */
export function clearInatLayer(map) {
  setInatData(map, EMPTY_FEATURE_COLLECTION, { ignorePause: true });
}

/** Показывает или скрывает слой iNat. */
export function setInatVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (map) {
    applyVisibility(map);
    // Чтобы «Кластеры-диаграммы» сразу убрали/вернули SVG по слою iNat.
    map.triggerRepaint?.();
  }
}

export function isInatLayerVisible() {
  return layerVisible;
}

/** Применяет режимы группировки iNat одним rebuild Supercluster. */
export function applyInatGroupingMode(
  map,
  {
    clusteringEnabled: nextClustering,
    clusterByRegnum: nextByRegnum,
    clusterPieCharts: nextPie,
    denseClustersHighlight: nextDense
  } = {}
) {
  let changed = false;

  if (nextClustering !== undefined && inatClusteringEnabled !== Boolean(nextClustering)) {
    inatClusteringEnabled = Boolean(nextClustering);
    if (!inatClusteringEnabled) {
      expandedInatCoincidentKeys = new Set();
    }
    changed = true;
  }

  if (nextByRegnum !== undefined && inatClusterByRegnum !== Boolean(nextByRegnum)) {
    inatClusterByRegnum = Boolean(nextByRegnum);
    changed = true;
  }

  if (nextPie !== undefined && inatClusterPieChartsEnabled !== Boolean(nextPie)) {
    inatClusterPieChartsEnabled = Boolean(nextPie);
    changed = true;
  }

  if (
    nextDense !== undefined &&
    inatDenseClustersHighlightEnabled !== Boolean(nextDense)
  ) {
    inatDenseClustersHighlightEnabled = Boolean(nextDense);
    expandedInatDensePileKeys = new Set();
    expandedInatCoincidentKeys = new Set();
    changed = true;
  }

  if (changed && map) {
    rebuildInatLayers(map);
  }
}

/** Включает/выключает кластеризацию слоя iNat. */
export function setInatClusteringEnabled(map, enabled) {
  applyInatGroupingMode(map, { clusteringEnabled: enabled });
}

/** Группировка кластеров iNat по царству (отдельные источники). */
export function setInatClusterByRegnum(map, enabled) {
  applyInatGroupingMode(map, { clusterByRegnum: enabled });
}

/** Включает/выключает «Кластеры-диаграммы» для слоя iNat (тот же режим, что у локальных точек). */
export function setInatClusterPieChartsEnabled(map, enabled) {
  applyInatGroupingMode(map, { clusterPieCharts: enabled });
}

export function isInatClusteringEnabled() {
  return inatClusteringEnabled;
}

export function isInatClusterByRegnumEnabled() {
  return inatClusterByRegnum;
}

export function isInatClusterPieChartsEnabled() {
  return inatClusterPieChartsEnabled;
}

/** Сверхплотные кластеры iNat: без обычной кластеризации, только кучи ≥10. */
export function setInatDenseClustersHighlightEnabled(map, enabled) {
  applyInatGroupingMode(map, { denseClustersHighlight: enabled });
}

/** Пересчитывает сверхплотные кучи iNat после смены порога. */
export function refreshInatDensePiles(map) {
  if (!map || !inatDenseClustersHighlightEnabled) {
    return;
  }
  setInatData(map, lastInatInputCollection);
}

export function isInatDenseClustersHighlightEnabled() {
  return inatDenseClustersHighlightEnabled;
}

/** Сворачивает раскрытые плотные группы iNat обратно в кластеры. */
export function collapseInatExpandedDensePiles(map) {
  expandedInatDensePileKeys = new Set();
  refreshInatDensePiles(map);
}

/**
 * Раскрывает плотную группу iNat по ключу координат и зумирует к разведённым точкам.
 */
export function expandInatDensePileByKey(
  map,
  key,
  {
    coordinates = null,
    pointCount = null,
    animateCamera = true,
    notify = true
  } = {}
) {
  if (!map?.getStyle?.() || !key || !inatDenseClustersHighlightEnabled) {
    return;
  }

  expandedInatDensePileKeys.add(key);
  setInatData(map, lastInatInputCollection);

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

  if (notify && typeof onInatDensePileExpandedCallback === "function") {
    onInatDensePileExpandedCallback({
      key,
      coordinates: center,
      pointCount: count
    });
  }
}

/** Регистрирует обработчик раскрытия плотной группы iNat. */
export function setInatDensePileExpandedHandler(handler) {
  onInatDensePileExpandedCallback = handler ?? null;
}

/** Задаёт обработчик клика по точке iNat (панель «Сведения о точке»). */
export function setInatPointClickHandler(handler) {
  onPointClickCallback = handler ?? null;
}

