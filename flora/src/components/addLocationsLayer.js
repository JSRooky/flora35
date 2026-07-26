import points from "../locations/points.json";

const PLANT_IMAGE = "/images/plant.svg";
const ANIMAL_IMAGE = "/images/animal.svg";

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
  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).unclustered);
  }

  return [getLayerIds().unclustered];
}

function getClusterLayerIds() {
  if (clusterByRegnum) {
    return getRegnumValues().map((regnum) => getLayerIds(regnum).clusters);
  }

  return [getLayerIds().clusters];
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

  map.addLayer({
    id: layerIds.unclustered,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": regnum
        ? REGNUM_COLORS[regnum] ?? DEFAULT_POINT_COLOR
        : getPointColorExpression(),
      "circle-radius": 6,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });
}

function rebuildLocationsLayers(map) {
  if (!locationsData || !map.getStyle()) {
    return;
  }

  detachLocationsInteractions(map);
  removeLocationsFromMap(map);

  const filteredFeatures = filterFeatures(locationsData.features, currentFilters);

  if (clusterByRegnum) {
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
  const hasLocationsSource = clusterByRegnum
    ? getRegnumValues().some((regnum) => map.getSource(getSourceId(regnum)))
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

export function isClusterByRegnumEnabled() {
  return clusterByRegnum;
}

export function addLocationsLayer(
  map,
  {
    onClusterExpanded,
    onPointClick,
    onMapBackgroundClick,
    clusterByRegnum: initialClusterByRegnum = true
  } = {}
) {
  locationsData = enrichWithImages(points);
  clusterByRegnum = initialClusterByRegnum;
  onClusterExpandedCallback = onClusterExpanded;
  onPointClickCallback = onPointClick;
  onMapBackgroundClickCallback = onMapBackgroundClick;
  rebuildLocationsLayers(map);
}
