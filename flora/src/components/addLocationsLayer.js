import points from "../locations/points.json";

const PLANT_IMAGE = "/images/plant.svg";
const ANIMAL_IMAGE = "/images/animal.svg";

let locationsData = null;

function enrichWithImages(data) {
  if (!data?.features) {
    return data;
  }

  return {
    ...data,
    features: data.features.map((feature) => {
      const image =
        feature.properties.regnum === "animalia" ? ANIMAL_IMAGE : PLANT_IMAGE;

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

export function filterFeatures(features, filters = {}) {
  const filterEntries = Object.entries(filters);
  if (filterEntries.length === 0) {
    return features;
  }

  return features.filter((feature) =>
    filterEntries.every(([key, value]) => feature.properties[key] === value)
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

export function getUnclusteredCenters(map, filters = {}, candidateFeatures = null) {
  if (!map.getSource("locations")) {
    return [];
  }

  const sourceFeatures = map.querySourceFeatures("locations", {
    filter: ["!", ["has", "point_count"]]
  });
  const renderedFeatures = map.queryRenderedFeatures({
    layers: ["unclustered-point"]
  });
  const visibleFeatures = sourceFeatures.length > 0 ? sourceFeatures : renderedFeatures;

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
  const source = map.getSource("locations");
  if (!source || !locationsData) {
    return;
  }

  const filteredFeatures = filterFeatures(locationsData.features, filters);

  source.setData({
    ...locationsData,
    features: filteredFeatures
  });
}

export function clearLocationsFilter(map) {
  applyLocationsFilter(map, {});
}

export function addLocationsLayer(map, { onClusterExpanded } = {}) {
  locationsData = enrichWithImages(points);

  // Источник с кластеризацией
  map.addSource("locations", {
    type: "geojson",
    data: locationsData,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  // Слой кластеров
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "locations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#4a90e2",
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

  // Число точек внутри кластера
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "locations",
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

  // Одиночные точки
  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "locations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#ff6600",
      "circle-radius": 6,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });

  // Клик по кластеру → зум внутрь
  map.on("click", "clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ["clusters"]
    });
    if (!features.length) {
      return;
    }

    const clusterId = features[0].properties.cluster_id;
    const source = map.getSource("locations");

    source.getClusterLeaves(clusterId, Infinity, 0, (leavesErr, leaves) => {
      if (leavesErr) {
        return;
      }

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) {
          return;
        }

        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom
        });

        map.once("moveend", () => {
          map.once("idle", () => {
            onClusterExpanded?.(leaves);
          });
        });
      });
    });
  });

  // Курсор при наведении на кластер — как у веб‑ссылки
  map.on("mouseenter", "clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
  });
}
