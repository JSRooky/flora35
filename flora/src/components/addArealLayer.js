import {
  getUnclusteredCenters,
  featureMatchesFilters,
  isFeatureUnclusteredOnMap
} from "./addLocationsLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

/** Принимает одну координату [lng, lat] или массив таких координат. */
function normalizeCenters(centers) {
  return Array.isArray(centers[0]) ? centers : [centers];
}

/**
 * Строит GeoJSON-полигон — аппроксимацию круга на сфере.
 * radiusKm — радиус в километрах от центра.
 */
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

/** Добавляет на карту слой заливки и контура ареала (изначально пустой). */
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

/** Рисует круги заданного радиуса вокруг одного или нескольких центров. */
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

/** Строит ареалы вокруг всех некластеризованных точек, видимых на карте. */
export function updateArealLayerForAll(map, radiusKm, filters = {}, expandedLeaves = null) {
  const centers = getUnclusteredCenters(map, filters, expandedLeaves);
  updateArealLayer(map, centers, radiusKm);
}

/**
 * Пересчитывает отображение ареала по текущему режиму:
 * ко всем маркерам, вокруг выбранной точки или очистка слоя.
 */
export function refreshArealDisplay(
  map,
  { allMarkers, enabled, feature, radiusKm, filters = {}, expandedLeaves = null }
) {
  if (!map) {
    return;
  }

  if (allMarkers) {
    updateArealLayerForAll(map, radiusKm, filters, expandedLeaves);
    return;
  }

  if (
    enabled &&
    feature &&
    featureMatchesFilters(feature, filters) &&
    // Ареал для одной точки показываем только если она не внутри кластера.
    isFeatureUnclusteredOnMap(map, feature)
  ) {
    updateArealLayer(map, feature.geometry.coordinates, radiusKm);
    return;
  }

  clearArealLayer(map);
}

export function clearArealLayer(map) {
  const source = map.getSource("areal");
  if (!source) {
    return;
  }

  source.setData(EMPTY_COLLECTION);
}
