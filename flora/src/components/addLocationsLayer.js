import points from "../locations/points.json";

const PLANT_IMAGE = "/images/plant.svg";
const ANIMAL_IMAGE = "/images/animal.svg";

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

export function addLocationsLayer(map) {
  const data = enrichWithImages(points);

  // Источник с кластеризацией
  map.addSource("locations", {
    type: "geojson",
    data,
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

    const clusterId = features[0].properties.cluster_id;

    map.getSource("locations").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;

      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom
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
