import { DEFAULT_CLUSTER_COLOR, DEFAULT_POINT_COLOR, getPointColorExpression } from "./pointColors";
import {
  addCompactGridLayers,
  buildCompactViewportFeatures,
  buildCompactViewportFromGeojson,
  compactCircleRadiusExpression,
  compactDensityFalseFilter,
  compactGridLayerIds,
  easeToCompactDensityCell,
  ensureCompactViewportSync,
  isCompactDensityFeature,
  isCompactPointDisplayEnabled,
  isRegionContourPickActive
} from "../map/compactPointDisplay";
import { shouldUseCompactDensityGrid } from "../map/compactGridSettings";
import {
  compactPropertiesMatchFilters,
  getCompactLocationFilters,
  locationFiltersNeedProperties
} from "../map/compactFilterState";
import {
  forEachVisibleTempLayerPoint,
  getTempLayerFeatureGroups,
  getTempLayerPlaqueFeatureGroups,
  getVisibleTempLayerFeatures,
  TEMP_LAYER_MARKER_PALETTE
} from "../tempLayers/tempLayerStore";
import { setTempLayerOverlaysData } from "./addTempLayerOverlaysLayer";
import { safeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";
import {
  ensureDensePilesLayers,
  partitionFeaturesByDensePiles,
  removeDensePilesLayers,
  setDensePilesData,
  TEMP_DENSE_PILES_CLUSTER_LAYER_ID,
  TEMP_DENSE_PILES_COUNT_LAYER_ID,
  TEMP_DENSE_PILES_SOURCE_ID
} from "./densePiles";
import {
  fitMapToCoincidentSpread,
  getCoincidentCoordKeys,
  getSpreadPileFitBounds,
  restoreOriginalCoordinates,
  spreadCoincidentFeatures
} from "./spreadCoincidentPoints";
import {
  cancelClusterHoverRequest,
  removePointHoverPopup,
  showClusterRegnumHover
} from "./pointHoverTooltips";

export const TEMP_LAYERS_SOURCE_ID = "temp-layers";
export const TEMP_LAYERS_LAYER_ID = "temp-layers-unclustered";
export const TEMP_LAYERS_CLUSTER_LAYER_ID = "temp-layers-clusters";
export const TEMP_LAYERS_CLUSTER_COUNT_LAYER_ID = "temp-layers-cluster-count";

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};
/** Максимум точек, вытаскиваемых из кластера по клику (не весь кластер целиком). */
const CLUSTER_CLICK_LEAVES_LIMIT = 20000;

const TEMP_LAYER_CIRCLE_COLOR = [
  "case",
  ["has", "temp_marker_color"],
  ["to-color", ["get", "temp_marker_color"]],
  getPointColorExpression()
];

const TEMP_LAYER_CLUSTER_COLOR = [
  "case",
  [
    "all",
    ["has", "marker_color"],
    ["!=", ["to-string", ["get", "marker_color"]], ""]
  ],
  ["to-color", ["get", "marker_color"]],
  DEFAULT_CLUSTER_COLOR
];

let layerVisible = false;
let clusterByTempLayers = true;
let clusterByTempSublayers = true;
let clusterPieChartsEnabled = false;
let clusteringEnabled = true;
let denseClustersHighlightEnabled = false;
let expandedTempCoincidentKeys = new Set();
let expandedTempDensePileKeys = new Set();
let tempDensePileMembers = new Map();
let onPointClickCallback = null;
let onTempDensePileExpandedCallback = null;
let interactionHandlers = null;
/** @type {Array<{ prop: string, color: string, layerId: string }>} */
let pieLayerKeys = [];
/** @type {Array<{
 *   sourceId: string,
 *   clusterLayerId: string,
 *   countLayerId: string,
 *   pointLayerId: string
 * }>} */
let activeUnits = [];
let hiddenPointFeatureKeys = [];
let locationFeatureFilter = (features) => features;

export function setTempLayersLocationFeatureFilter(filterFn) {
  locationFeatureFilter = typeof filterFn === "function" ? filterFn : (features) => features;
}

function tempPointMatchesCompactFilters(lng, lat, feature) {
  const locationFilters = getCompactLocationFilters();
  if (!locationFiltersNeedProperties(locationFilters)) {
    return true;
  }
  return compactPropertiesMatchFilters(feature?.properties, lng, lat, locationFilters);
}

function getTempDensePileMembers(feature) {
  const key = feature?.properties?.dense_pile_key;
  if (!key) {
    return [];
  }
  return tempDensePileMembers.get(`dense-${key}`) ?? [];
}

function getTempFeatureStableKey(feature) {
  const properties = feature?.properties ?? {};
  if (properties.gbif_key != null && properties.gbif_key !== "") {
    return `gbif-${properties.gbif_key}`;
  }
  if (properties.inat_id != null && properties.inat_id !== "") {
    return `inat-${properties.inat_id}`;
  }
  if (feature?.id != null && feature.id !== "") {
    return String(feature.id);
  }
  const coordinates = feature?.geometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return coordinates.join(",");
  }
  return "";
}

function excludeHiddenPinFeatures(features) {
  if (!hiddenPointFeatureKeys.length) {
    return features;
  }

  const hidden = new Set(hiddenPointFeatureKeys.map(String));
  return (features ?? []).filter((feature) => {
    const key = getTempFeatureStableKey(feature);
    return !key || !hidden.has(key);
  });
}

function prepareMapTempFeatures(features) {
  if (!denseClustersHighlightEnabled) {
    return {
      mapFeatures: isTempMapboxClusteringActive()
        ? spreadCoincidentFeatures(features, expandedTempCoincidentKeys)
        : spreadCoincidentFeatures(features),
      denseClusterFeatures: [],
      densePileMembersById: new Map()
    };
  }

  const { expandedDenseFeatures, denseClusterFeatures, densePileMembersById } =
    partitionFeaturesByDensePiles(features, {
      expandedPileKeys: expandedTempDensePileKeys
    });

  return {
    mapFeatures: spreadCoincidentFeatures(expandedDenseFeatures),
    denseClusterFeatures,
    densePileMembersById
  };
}

function syncTempDensePilesLayers(map, denseClusterFeatures) {
  if (!denseClustersHighlightEnabled) {
    removeDensePilesLayers(map, {
      sourceId: TEMP_DENSE_PILES_SOURCE_ID,
      clusterLayerId: TEMP_DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: TEMP_DENSE_PILES_COUNT_LAYER_ID
    });
    return;
  }

  const visibility = layerVisible ? "visible" : "none";

  if (!map.getSource(TEMP_DENSE_PILES_SOURCE_ID)) {
    ensureDensePilesLayers(map, {
      sourceId: TEMP_DENSE_PILES_SOURCE_ID,
      clusterLayerId: TEMP_DENSE_PILES_CLUSTER_LAYER_ID,
      countLayerId: TEMP_DENSE_PILES_COUNT_LAYER_ID,
      features: denseClusterFeatures,
      visibility
    });
    return;
  }

  setDensePilesData(map, TEMP_DENSE_PILES_SOURCE_ID, denseClusterFeatures);
  [TEMP_DENSE_PILES_CLUSTER_LAYER_ID, TEMP_DENSE_PILES_COUNT_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function sanitizeUnitId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isTempMapboxClusteringActive() {
  if (isCompactPointDisplayEnabled()) {
    return false;
  }
  return clusteringEnabled && !denseClustersHighlightEnabled;
}

function isSplitByLayer() {
  return clusterByTempLayers && !clusterPieChartsEnabled && isTempMapboxClusteringActive();
}

function isSplitBySublayer() {
  return isSplitByLayer() && clusterByTempSublayers;
}

function buildUnits() {
  const units = !isSplitByLayer()
    ? [
        {
          id: "all",
          markerColor: null,
          features: getVisibleTempLayerFeatures()
        }
      ]
    : isSplitBySublayer()
      ? getTempLayerFeatureGroups()
      : getTempLayerPlaqueFeatureGroups();

  return units.map((unit) => ({
    ...unit,
    features: locationFeatureFilter(unit.features ?? [])
  }));
}

function unitLayerIds(unitId) {
  if (!isSplitByLayer()) {
    return {
      sourceId: TEMP_LAYERS_SOURCE_ID,
      clusterLayerId: TEMP_LAYERS_CLUSTER_LAYER_ID,
      countLayerId: TEMP_LAYERS_CLUSTER_COUNT_LAYER_ID,
      pointLayerId: TEMP_LAYERS_LAYER_ID
    };
  }
  const suffix = `--${sanitizeUnitId(unitId)}`;
  return {
    sourceId: `${TEMP_LAYERS_SOURCE_ID}${suffix}`,
    clusterLayerId: `${TEMP_LAYERS_CLUSTER_LAYER_ID}${suffix}`,
    countLayerId: `${TEMP_LAYERS_CLUSTER_COUNT_LAYER_ID}${suffix}`,
    pointLayerId: `${TEMP_LAYERS_LAYER_ID}${suffix}`
  };
}

function circleColorForUnit(markerColor) {
  if (markerColor) {
    return markerColor;
  }
  return TEMP_LAYER_CIRCLE_COLOR;
}

function clusterColorForUnit(markerColor) {
  if (markerColor) {
    return markerColor;
  }
  return TEMP_LAYER_CLUSTER_COLOR;
}

function buildPieClusterProperties() {
  const groups = getTempLayerFeatureGroups();
  pieLayerKeys = groups.map((group, index) => ({
    prop: `tlc_${index}`,
    color:
      group.markerColor ||
      TEMP_LAYER_MARKER_PALETTE[index % TEMP_LAYER_MARKER_PALETTE.length] ||
      DEFAULT_POINT_COLOR,
    layerId: group.id
  }));

  return Object.fromEntries(
    pieLayerKeys.map(({ prop, layerId }) => [
      prop,
      [
        "+",
        ["case", ["==", ["get", "temp_layer_id"], layerId], 1, 0]
      ]
    ])
  );
}

function getClusterPaint(markerColor) {
  if (clusterPieChartsEnabled) {
    return {
      "circle-color": "#000000",
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32],
      "circle-stroke-width": 0,
      "circle-opacity": 0,
      "circle-stroke-opacity": 0
    };
  }

  return {
    "circle-color": clusterColorForUnit(markerColor),
    "circle-radius": ["step", ["get", "point_count"], 16, 50, 20, 200, 26],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff"
  };
}

function applyVisibility(map) {
  const visibility = layerVisible ? "visible" : "none";
  activeUnits.forEach((unit) => {
    const { fillId, lineId } = compactGridLayerIds(unit.sourceId);
    [unit.clusterLayerId, unit.countLayerId, unit.pointLayerId, fillId, lineId].forEach(
      (layerId) => {
        if (map?.getLayer?.(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility);
        }
      }
    );
  });
  [TEMP_DENSE_PILES_CLUSTER_LAYER_ID, TEMP_DENSE_PILES_COUNT_LAYER_ID].forEach((layerId) => {
    if (map?.getLayer?.(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
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
    clusterHoverLayerIds,
    pointLayerIds
  } = interactionHandlers;

  (clusterLayerIds ?? []).forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }
    map.off("click", layerId, clusterClick);
  });

  (clusterHoverLayerIds ?? clusterLayerIds ?? []).forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }
    map.off("mouseenter", layerId, clusterEnter);
    map.off("mouseleave", layerId, clusterLeave);
  });

  (pointLayerIds ?? []).forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }
    map.off("click", layerId, pointClick);
    map.off("mouseenter", layerId, pointEnter);
    map.off("mouseleave", layerId, pointLeave);
  });

  interactionHandlers = null;
}

function removeTempLayersFromMap(map) {
  detachInteractions(map);
  activeUnits.forEach((unit) => {
    const { fillId, lineId } = compactGridLayerIds(unit.sourceId);
    [unit.clusterLayerId, unit.countLayerId, unit.pointLayerId, fillId, lineId].forEach(
      (layerId) => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      }
    );
    if (map.getSource(unit.sourceId)) {
      map.removeSource(unit.sourceId);
    }
  });
  activeUnits = [];
  removeDensePilesLayers(map, {
    sourceId: TEMP_DENSE_PILES_SOURCE_ID,
    clusterLayerId: TEMP_DENSE_PILES_CLUSTER_LAYER_ID,
    countLayerId: TEMP_DENSE_PILES_COUNT_LAYER_ID
  });
}

function attachInteractions(map) {
  detachInteractions(map);

  const clusterLayerIds = [
    ...activeUnits.map((unit) => unit.clusterLayerId),
    TEMP_DENSE_PILES_CLUSTER_LAYER_ID
  ].filter((layerId) => map.getLayer(layerId));
  const clusterHoverLayerIds = [
    ...clusterLayerIds,
    ...activeUnits.map((unit) => unit.countLayerId),
    TEMP_DENSE_PILES_COUNT_LAYER_ID
  ].filter((layerId) => map.getLayer(layerId));
  const pointLayerIds = activeUnits
    .flatMap((unit) => [
      unit.pointLayerId,
      compactGridLayerIds(unit.sourceId).fillId
    ])
    .filter((layerId) => map.getLayer(layerId));

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
      event.preventDefault?.();
      event.originalEvent?.stopPropagation?.();
      expandTempDensePileByKey(map, key, {
        coordinates: feature.geometry?.coordinates,
        pointCount: feature.properties?.point_count
      });
      return;
    }

    const clusterId = feature?.properties?.cluster_id;
    const source = feature?.source ? map.getSource(feature.source) : null;

    if (clusterId == null || !source?.getClusterLeaves || !source?.getClusterExpansionZoom) {
      return;
    }

    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();

    // Infinity вытаскивал ВЕСЬ кластер только чтобы найти совпадающие координаты — вешало вкладку.
    source.getClusterLeaves(clusterId, CLUSTER_CLICK_LEAVES_LIMIT, 0, (leavesErr, leaves) => {
      if (leavesErr) {
        return;
      }

      const restoredLeaves = (leaves ?? []).map(restoreOriginalCoordinates);
      const coincidentKeys = getCoincidentCoordKeys(restoredLeaves);

      if (coincidentKeys.size > 0) {
        coincidentKeys.forEach((key) => expandedTempCoincidentKeys.add(key));
        setTempLayersData(map);
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

  const pointClick = (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }
    if (isCompactDensityFeature(feature)) {
      if (isRegionContourPickActive(map)) {
        return;
      }
      event.preventDefault?.();
      event.originalEvent?.stopPropagation?.();
      easeToCompactDensityCell(map, feature);
      return;
    }
    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    onPointClickCallback?.(feature);
  };

  const clusterEnter = (event) => {
    map.getCanvas().style.cursor = "pointer";
    showClusterRegnumHover(map, event, {
      getDensePileLeaves: getTempDensePileMembers
    });
  };

  const clusterLeave = () => {
    map.getCanvas().style.cursor = "";
    cancelClusterHoverRequest();
    removePointHoverPopup();
  };

  const pointerEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const pointerLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  clusterLayerIds.forEach((layerId) => {
    map.on("click", layerId, clusterClick);
  });
  clusterHoverLayerIds.forEach((layerId) => {
    map.on("mouseenter", layerId, clusterEnter);
    map.on("mouseleave", layerId, clusterLeave);
  });
  pointLayerIds.forEach((layerId) => {
    map.on("click", layerId, pointClick);
    map.on("mouseenter", layerId, pointerEnter);
    map.on("mouseleave", layerId, pointerLeave);
  });

  interactionHandlers = {
    clusterClick,
    clusterEnter,
    clusterLeave,
    pointClick,
    pointEnter: pointerEnter,
    pointLeave: pointerLeave,
    clusterLayerIds,
    clusterHoverLayerIds,
    pointLayerIds
  };
}

function addUnitToMap(map, unit) {
  const ids = unitLayerIds(unit.id);
  const collection = {
    type: "FeatureCollection",
    features: (unit.features ?? []).filter((feature) => {
      const type = feature?.geometry?.type;
      return type === "Point" || type === "Polygon";
    })
  };
  const useClustering = isTempMapboxClusteringActive();
  const clusterProperties = {
    marker_color: ["coalesce", ["get", "temp_marker_color"]],
    src_gbif: ["+", ["case", ["==", ["get", "temp_source"], "gbif"], 1, 0]],
    src_inat: ["+", ["case", ["==", ["get", "temp_source"], "inat"], 1, 0]],
    ...(clusterPieChartsEnabled && useClustering ? buildPieClusterProperties() : {})
  };

  if (!clusterPieChartsEnabled || !useClustering) {
    pieLayerKeys = [];
  }

  map.addSource(
    ids.sourceId,
    useClustering
      ? {
          type: "geojson",
          data: collection,
          cluster: true,
          clusterMaxZoom: CLUSTER_OPTIONS.clusterMaxZoom,
          clusterRadius: CLUSTER_OPTIONS.clusterRadius,
          clusterProperties
        }
      : {
          type: "geojson",
          data: collection
        }
  );

  if (useClustering) {
    map.addLayer({
      id: ids.clusterLayerId,
      type: "circle",
      source: ids.sourceId,
      filter: ["has", "point_count"],
      paint: getClusterPaint(unit.markerColor)
    });

    if (!clusterPieChartsEnabled) {
      map.addLayer({
        id: ids.countLayerId,
        type: "symbol",
        source: ids.sourceId,
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

  map.addLayer({
    id: ids.pointLayerId,
    type: "circle",
    source: ids.sourceId,
    filter: useClustering
      ? ["all", compactDensityFalseFilter(), ["!", ["has", "point_count"]]]
      : compactDensityFalseFilter(),
    paint: {
      "circle-color": circleColorForUnit(unit.markerColor),
      "circle-radius": compactCircleRadiusExpression(5),
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });
  addCompactGridLayers(map, ids.sourceId, unit.markerColor);

  activeUnits.push({ ...ids, markerColor: unit.markerColor });
}

export function setTempLayersData(map) {
  if (!map?.getSource || !map.getStyle()) {
    return;
  }

  if (isCompactPointDisplayEnabled()) {
    ensureCompactViewportSync(map, "temp", () => setTempLayersData(map));
  }

  removeTempLayersFromMap(map);
  pieLayerKeys = [];
  tempDensePileMembers = new Map();
  const denseClusterFeatures = [];

  if (isCompactPointDisplayEnabled() && shouldUseCompactDensityGrid() && !isSplitByLayer()) {
    const built = buildCompactViewportFeatures({
      map,
      source: "temp",
      forEachPoint: (visit) =>
        forEachVisibleTempLayerPoint((lng, lat, feature) => {
          if (!tempPointMatchesCompactFilters(lng, lat, feature)) {
            return;
          }
          visit(lng, lat);
        })
    });
    addUnitToMap(map, { id: "all", markerColor: null, features: built.features });
  } else {
    buildUnits()
      .filter((unit) => unit.features.length > 0)
      .forEach((unit) => {
        if (isCompactPointDisplayEnabled()) {
          const built = buildCompactViewportFromGeojson(map, unit.features, "temp");
          addUnitToMap(map, {
            ...unit,
            features: excludeHiddenPinFeatures(built.features)
          });
          return;
        }
        const prepared = prepareMapTempFeatures(unit.features);
        denseClusterFeatures.push(...prepared.denseClusterFeatures);
        (prepared.densePileMembersById ?? new Map()).forEach((members, key) => {
          tempDensePileMembers.set(key, members);
        });
        addUnitToMap(map, {
          ...unit,
          features: excludeHiddenPinFeatures(prepared.mapFeatures)
        });
      });
  }

  syncTempDensePilesLayers(map, denseClusterFeatures);
  attachInteractions(map);
  applyVisibility(map);
  setTempLayerOverlaysData(map, { visible: layerVisible });
}

export function applyTempLayersGroupingMode(
  map,
  {
    clusterByTempLayers: nextClusterByTempLayers,
    clusterByTempSublayers: nextClusterByTempSublayers,
    clusterPieCharts: nextPie,
    clusteringEnabled: nextClustering,
    denseClustersHighlight: nextDense
  } = {}
) {
  if (nextClustering !== undefined && clusteringEnabled !== Boolean(nextClustering)) {
    clusteringEnabled = Boolean(nextClustering);
    if (!clusteringEnabled) {
      expandedTempCoincidentKeys = new Set();
    }
  }
  if (nextPie !== undefined) {
    clusterPieChartsEnabled = Boolean(nextPie);
  }
  if (nextClusterByTempLayers !== undefined) {
    clusterByTempLayers = Boolean(nextClusterByTempLayers);
  }
  if (nextClusterByTempSublayers !== undefined) {
    clusterByTempSublayers = Boolean(nextClusterByTempSublayers);
  }
  if (
    nextDense !== undefined &&
    denseClustersHighlightEnabled !== Boolean(nextDense)
  ) {
    denseClustersHighlightEnabled = Boolean(nextDense);
    expandedTempDensePileKeys = new Set();
    expandedTempCoincidentKeys = new Set();
  }
  if (clusterPieChartsEnabled) {
    clusterByTempLayers = false;
  }
  if (!map) {
    return;
  }
  setTempLayersData(map);
}

export function addTempLayersLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }
  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }
  setTempLayersData(map);
}

export function setTempLayersVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (!map) {
    return;
  }
  if (activeUnits.length === 0) {
    if (layerVisible) {
      setTempLayersData(map);
    } else {
      applyVisibility(map);
      setTempLayerOverlaysData(map, { visible: layerVisible });
    }
    return;
  }
  applyVisibility(map);
  setTempLayerOverlaysData(map, { visible: layerVisible });
}

/**
 * Слои, по которым клик считается попаданием в точку/кластер данных.
 * Плотностную сетку (compact grid) сюда не включаем: это грубый агрегат,
 * покрывающий большие площади карты, и если считать клик по нему «попаданием
 * в данные», это полностью блокирует клики по фоновым слоям карты — например,
 * выбор региона по контуру, если он оказался под ячейкой сетки.
 */
export function getTempLayersInteractiveLayerIds() {
  return [
    ...activeUnits.flatMap((unit) => [unit.clusterLayerId, unit.pointLayerId]),
    TEMP_DENSE_PILES_CLUSTER_LAYER_ID
  ];
}

export function getTempCompactGridLayerColor(sourceId) {
  const unit = activeUnits.find((entry) => entry.sourceId === sourceId);
  return unit?.markerColor || null;
}

export function clearTempLayersLayer(map) {
  if (!map) {
    return;
  }
  removeTempLayersFromMap(map);
}

export function isTempLayersVisible() {
  return layerVisible;
}

export function getTempLayersClusterSourceIds() {
  return activeUnits.map((unit) => unit.sourceId);
}

export function isTempLayersClusterPieChartsEnabled() {
  return clusterPieChartsEnabled;
}

export function getTempLayerPieSegments(props) {
  if (!pieLayerKeys.length || !props) {
    return null;
  }

  const hasCounts = pieLayerKeys.some(({ prop }) => props[prop] != null);
  if (!hasCounts) {
    return null;
  }

  return pieLayerKeys.map(({ prop, color }) => ({
    count: Number(props[prop]) || 0,
    color
  }));
}

export function isTempLayersClusterByLayerEnabled() {
  return clusterByTempLayers && !clusterPieChartsEnabled;
}

export function refreshTempLayersDensePiles(map) {
  if (!map || !denseClustersHighlightEnabled) {
    return;
  }
  setTempLayersData(map);
}

/** Сворачивает раскрытые плотные группы временных слоёв обратно в кластеры. */
export function collapseTempExpandedDensePiles(map) {
  expandedTempDensePileKeys = new Set();
  refreshTempLayersDensePiles(map);
}

export function expandTempDensePileByKey(
  map,
  key,
  {
    coordinates = null,
    pointCount = null,
    animateCamera = true,
    notify = true
  } = {}
) {
  if (!map?.getStyle?.() || !key || !denseClustersHighlightEnabled) {
    return;
  }

  expandedTempDensePileKeys.add(key);
  setTempLayersData(map);

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

  if (notify && typeof onTempDensePileExpandedCallback === "function") {
    onTempDensePileExpandedCallback({
      key,
      coordinates: center,
      pointCount: count
    });
  }
}

export function setTempDensePileExpandedHandler(handler) {
  onTempDensePileExpandedCallback = handler ?? null;
}

/**
 * Скрывает обычные маркеры временных слоёв для точек, показанных булавкой.
 */
export function setTempLayersHiddenPointFeatureKeys(map, keys) {
  hiddenPointFeatureKeys = [...new Set((keys ?? []).filter(Boolean).map(String))];
  if (!map) {
    return;
  }
  setTempLayersData(map);
}

