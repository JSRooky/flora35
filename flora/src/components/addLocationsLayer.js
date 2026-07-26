import points from "../locations/points.json";

const PUBLIC_URL = process.env.PUBLIC_URL || "";
const PLANT_IMAGE = `${PUBLIC_URL}/images/plant.svg`;
const ANIMAL_IMAGE = `${PUBLIC_URL}/images/animal.svg`;

const CLUSTER_OPTIONS = {
  clusterMaxZoom: 14,
  clusterRadius: 50
};

const REGNUM_COLORS = {
  plantae: "#27ae60",
  animalia: "#ff6600",
  fungi: "#9b59b6"
};

const DEFAULT_CLUSTER_COLOR = "#4a90e2";
const DEFAULT_POINT_COLOR = "#4a90e2";

let locationsData = null;
let clusterByRegnum = true;
let clusteringEnabled = true;
let markersVisible = true;
let currentFilters = {};
let interactionHandlers = null;
let onClusterExpandedCallback = null;
let onPointClickCallback = null;
let onMapBackgroundClickCallback = null;

function enrichWithImages(data) {
  if (!data?.features) {
    return data;
  }

  return {
    ...data,
    features: data.features.map((feature) => {
      const image =
        feature.properties.regnum === "animalia"
          ? ANIMAL_IMAGE
          : PLANT_IMAGE;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          image
        }
      };
    })
  };
}

function getRegnumValues(features = locationsData?.features ?? []) {
  return [...new Set(features.map((feature) => feature.properties.regnum).filter(Boolean))];
}

function getSourceId(regnum = null) {
  return regnum ? `locations-${regnum}` : "locations";
}

function getLayerIds(regnum = null) {
  const suffix = regnum ? `-${regnum}` : "";
  return {
    clusters: `clusters${suffix}`,
    clusterCount: `cluster-count${suffix}`,
    unclustered: regnum ? `unclustered-${regnum}` : "unclustered-point"
  };
}

export function getUnclusteredLayerIds() {
  if (!clusteringEnabled) {
    return [getLayerIds().unclustered];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).unclustered);
  }

  return [getLayerIds().unclustered];
}

export function getFirstLocationsLayerId(map) {
  const layerIds = [...getClusterLayerIds(), ...getUnclusteredLayerIds()];
  return layerIds.find((layerId) => map.getLayer(layerId));
}

function getClusterLayerIds() {
  if (!clusteringEnabled) {
    return [];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).clusters);
  }

  return [getLayerIds().clusters];
}

function getClusterCountLayerIds() {
  if (!clusteringEnabled) {
    return [];
  }

  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).clusterCount);
  }

  return [getLayerIds().clusterCount];
}

function getAllLocationsLayerIds() {
  return [
    ...getClusterLayerIds(),
    ...getClusterCountLayerIds(),
    ...getUnclusteredLayerIds()
  ];
}

function applyMarkersVisibility(map) {
  const visibility = markersVisible ? "visible" : "none";

  getAllLocationsLayerIds().forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

function getPointColorExpression() {
  return [
    "match",
    ["get", "regnum"],
    "plantae", REGNUM_COLORS.plantae,
    "animalia", REGNUM_COLORS.animalia,
    "fungi", REGNUM_COLORS.fungi,
    DEFAULT_POINT_COLOR
  ];
}

function removeLocationsFromMap(map) {
  [getLayerIds().clusters, getLayerIds().clusterCount, getLayerIds().unclustered].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
  );

  if (map.getSource("locations")) {
    map.removeSource("locations");
  }

  getRegnumValues().forEach((regnum) => {
    const layerIds = getLayerIds(regnum);
    [layerIds.clusters, layerIds.clusterCount, layerIds.unclustered].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    const sourceId = getSourceId(regnum);
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  });
}

function detachLocationsInteractions(map) {
  if (!interactionHandlers) {
    return;
  }

  interactionHandlers.clusterLayerIds.forEach((layerId) => {
    map.off("click", layerId, interactionHandlers.clusterClick);
    map.off("mouseenter", layerId, interactionHandlers.clusterEnter);
    map.off("mouseleave", layerId, interactionHandlers.clusterLeave);
  });

  interactionHandlers.unclusteredLayerIds.forEach((layerId) => {
    map.off("click", layerId, interactionHandlers.pointClick);
    map.off("mouseenter", layerId, interactionHandlers.pointEnter);
    map.off("mouseleave", layerId, interactionHandlers.pointLeave);
  });

  if (interactionHandlers.mapClick) {
    map.off("click", interactionHandlers.mapClick);
  }

  interactionHandlers = null;
}

function attachLocationsInteractions(map) {
  detachLocationsInteractions(map);

  const clusterLayerIds = getClusterLayerIds();
  const unclusteredLayerIds = getUnclusteredLayerIds();

  const clusterClick = (event) => {
    const features = map.queryRenderedFeatures(event.point, {
      layers: clusterLayerIds
    });
    if (!features.length) {
      return;
    }

    const clusterFeature = features[0];
    const sourceId = clusterFeature.source;
    const clusterId = clusterFeature.properties.cluster_id;
    const source = map.getSource(sourceId);

    source.getClusterLeaves(clusterId, Infinity, 0, (leavesErr, leaves) => {
      if (leavesErr) {
        return;
      }

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) {
          return;
        }

        map.easeTo({
          center: clusterFeature.geometry.coordinates,
          zoom
        });

        map.once("moveend", () => {
          map.once("idle", () => {
            onClusterExpandedCallback?.(leaves);
          });
        });
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
    const feature = event.features?.[0];
    if (feature) {
      onPointClickCallback?.(feature);
    }
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

  const mapClick = (event) => {
    const locationLayerIds = [...clusterLayerIds, ...unclusteredLayerIds].filter((layerId) =>
      map.getLayer(layerId)
    );

    if (locationLayerIds.length === 0) {
      return;
    }

    const features = map.queryRenderedFeatures(event.point, {
      layers: locationLayerIds
    });

    if (!features.length) {
      onMapBackgroundClickCallback?.();
    }
  };

  map.on("click", mapClick);

  interactionHandlers = {
    clusterLayerIds,
    unclusteredLayerIds,
    clusterClick,
    clusterEnter,
    clusterLeave,
    pointClick,
    pointEnter,
    pointLeave,
    mapClick
  };
}

function addUnclusteredLayer(map, sourceId, regnum = null) {
  const layerIds = getLayerIds(regnum);

  const layer = {
    id: layerIds.unclustered,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-color": regnum
        ? REGNUM_COLORS[regnum] ?? DEFAULT_POINT_COLOR
        : getPointColorExpression(),
      "circle-radius": 5,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  };

  if (clusteringEnabled) {
    layer.filter = ["!", ["has", "point_count"]];
  }

  map.addLayer(layer);
}

function addClusterLayers(map, sourceId, regnum = null) {
  const layerIds = getLayerIds(regnum);
  const clusterColor = regnum ? REGNUM_COLORS[regnum] ?? DEFAULT_CLUSTER_COLOR : DEFAULT_CLUSTER_COLOR;

  map.addLayer({
    id: layerIds.clusters,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": clusterColor,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18, 10,
        24, 30,
        32
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: layerIds.clusterCount,
    type: "symbol",
    source: sourceId,
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  addUnclusteredLayer(map, sourceId, regnum);
}

function rebuildLocationsLayers(map) {
  if (!locationsData || !map.getStyle()) {
    return;
  }

  detachLocationsInteractions(map);
  removeLocationsFromMap(map);

  const filteredFeatures = filterFeatures(locationsData.features, currentFilters);

  if (!clusteringEnabled) {
    map.addSource("locations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: filteredFeatures
      }
    });

    addUnclusteredLayer(map, "locations");
  } else if (clusterByRegnum) {
    getRegnumValues().forEach((regnum) => {
      const sourceId = getSourceId(regnum);
      const features = filteredFeatures.filter(
        (feature) => feature.properties.regnum === regnum
      );

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features
        },
        cluster: true,
        ...CLUSTER_OPTIONS
      });

      addClusterLayers(map, sourceId, regnum);
    });
  } else {
    map.addSource("locations", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: filteredFeatures
      },
      cluster: true,
      ...CLUSTER_OPTIONS
    });

    addClusterLayers(map, "locations");
  }

  attachLocationsInteractions(map);
  applyMarkersVisibility(map);
}

export function filterFeatures(features, filters = {}) {
  const filterEntries = Object.entries(filters);
  if (filterEntries.length === 0) {
    return features;
  }

  return features.filter((feature) =>
    filterEntries.every(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return true;
        }

        return value.includes(feature.properties[key]);
      }

      return feature.properties[key] === value;
    })
  );
}

export function getFilteredFeatureCenters(filters = {}) {
  if (!locationsData) {
    return [];
  }

  return filterFeatures(locationsData.features, filters).map(
    (feature) => feature.geometry.coordinates
  );
}

function dedupeCenters(centers) {
  const seen = new Set();

  return centers.filter(([lng, lat]) => {
    const key = `${lng},${lat}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function queryUnclusteredSourceFeatures(map) {
  if (!clusteringEnabled) {
    const sourceId = "locations";
    if (!map.getSource(sourceId)) {
      return [];
    }

    return map.querySourceFeatures(sourceId);
  }

  const sourceIds = clusterByRegnum
    ? getRegnumValues().map((regnum) => getSourceId(regnum))
    : ["locations"];

  return sourceIds.flatMap((sourceId) => {
    if (!map.getSource(sourceId)) {
      return [];
    }

    return map.querySourceFeatures(sourceId, {
      filter: ["!", ["has", "point_count"]]
    });
  });
}

export function getUnclusteredCenters(map, filters = {}, candidateFeatures = null) {
  const hasLocationsSource = clusteringEnabled
    ? clusterByRegnum
      ? getRegnumValues().some((regnum) => map.getSource(getSourceId(regnum)))
      : map.getSource("locations")
    : map.getSource("locations");

  if (!hasLocationsSource) {
    return [];
  }

  const sourceFeatures = queryUnclusteredSourceFeatures(map);
  const visibleFeatures =
    sourceFeatures.length > 0
      ? sourceFeatures
      : map.queryRenderedFeatures({ layers: getUnclusteredLayerIds() });

  if (candidateFeatures?.length) {
    const visibleKeys = new Set(
      visibleFeatures.map(
        (feature) => `${feature.geometry.coordinates[0]},${feature.geometry.coordinates[1]}`
      )
    );

    return dedupeCenters(
      filterFeatures(candidateFeatures, filters)
        .map((feature) => feature.geometry.coordinates)
        .filter(([lng, lat]) => visibleKeys.has(`${lng},${lat}`))
    );
  }

  return dedupeCenters(
    filterFeatures(visibleFeatures, filters).map((feature) => feature.geometry.coordinates)
  );
}

export function isFeatureUnclusteredOnMap(map, feature) {
  if (!feature?.geometry?.coordinates) {
    return false;
  }

  if (!clusteringEnabled) {
    return featureMatchesFilters(feature, currentFilters);
  }

  const [lng, lat] = feature.geometry.coordinates;

  return getUnclusteredCenters(map).some(
    ([clusterLng, clusterLat]) => clusterLng === lng && clusterLat === lat
  );
}

export function featureMatchesFilters(feature, filters = {}) {
  return filterFeatures([feature], filters).length > 0;
}

export function applyLocationsFilter(map, filters = {}) {
  currentFilters = filters;
  rebuildLocationsLayers(map);
}

export function clearLocationsFilter(map) {
  applyLocationsFilter(map, {});
}

export function setClusterByRegnum(map, enabled) {
  clusterByRegnum = enabled;
  rebuildLocationsLayers(map);
}

export function setClusteringEnabled(map, enabled) {
  clusteringEnabled = enabled;
  rebuildLocationsLayers(map);
}

export function setMarkersVisible(map, visible) {
  markersVisible = visible;
  applyMarkersVisibility(map);
}

export function isClusterByRegnumEnabled() {
  return clusterByRegnum;
}

export function isClusteringEnabled() {
  return clusteringEnabled;
}

export function isMarkersVisible() {
  return markersVisible;
}

export function addLocationsLayer(
  map,
  {
    onClusterExpanded,
    onPointClick,
    onMapBackgroundClick,
    clusterByRegnum: initialClusterByRegnum = true,
    clusteringEnabled: initialClusteringEnabled = true,
    markersVisible: initialMarkersVisible = true
  } = {}
) {
  locationsData = enrichWithImages(points);
  clusterByRegnum = initialClusterByRegnum;
  clusteringEnabled = initialClusteringEnabled;
  markersVisible = initialMarkersVisible;
  onClusterExpandedCallback = onClusterExpanded;
  onPointClickCallback = onPointClick;
  onMapBackgroundClickCallback = onMapBackgroundClick;
  rebuildLocationsLayers(map);
}
