import points from "../locations/points.json";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

function normalizeCenters(centers) {
  return Array.isArray(centers[0]) ? centers : [centers];
}

function createCirclePolygon(center, radiusKm, steps = 64) {
  const [lng, lat] = center;
  const coords = [];
  const earthRadiusKm = 6371;

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const newLat = lat + (dy / earthRadiusKm) * (180 / Math.PI);
    const newLng =
      lng +
      ((dx / earthRadiusKm) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
    coords.push([newLng, newLat]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coords]
    }
  };
}

export function addArealLayer(map) {
  if (map.getSource("areal")) {
    return;
  }

  map.addSource("areal", {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: "areal-fill",
    type: "fill",
    source: "areal",
    paint: {
      "fill-color": "#2ecc71",
      "fill-opacity": 0.2
    }
  });

  map.addLayer({
    id: "areal-outline",
    type: "line",
    source: "areal",
    paint: {
      "line-color": "#27ae60",
      "line-width": 2
    }
  });
}

export function updateArealLayer(map, centers, radiusKm) {
  const source = map.getSource("areal");
  if (!source) {
    return;
  }

  const features = normalizeCenters(centers).map((center) =>
    createCirclePolygon(center, radiusKm)
  );

  source.setData({
    type: "FeatureCollection",
    features
  });
}

export function updateArealLayerForAll(map, radiusKm) {
  const centers = points.features.map((feature) => feature.geometry.coordinates);
  updateArealLayer(map, centers, radiusKm);
}

export function clearArealLayer(map) {
  const source = map.getSource("areal");
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}
