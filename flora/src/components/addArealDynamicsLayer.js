const SOURCE_ID = "species-areal-dynamics";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const FILL_OPACITY = 0.32;
const OUTLINE_WIDTH = 1;
const OUTLINE_OPACITY = 0.55;

const FILL_PAINT = {
  "fill-color": ["get", "fillColor"],
  "fill-opacity": FILL_OPACITY,
  "fill-antialias": true
};

const OUTLINE_PAINT = {
  "line-color": ["get", "fillColor"],
  "line-width": OUTLINE_WIDTH,
  "line-opacity": OUTLINE_OPACITY
};

function ensureArealDynamicsLayers(map) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION
    });
  }

  if (!map.getLayer("areal-dynamics-fill")) {
    map.addLayer({
      id: "areal-dynamics-fill",
      type: "fill",
      source: SOURCE_ID,
      paint: FILL_PAINT
    });
  }

  if (!map.getLayer("areal-dynamics-outline")) {
    map.addLayer({
      id: "areal-dynamics-outline",
      type: "line",
      source: SOURCE_ID,
      paint: OUTLINE_PAINT
    });
  }
}

function moveArealDynamicsLayersToTop(map) {
  if (!map.getLayer("areal-dynamics-fill")) {
    return;
  }

  map.moveLayer("areal-dynamics-fill");
  map.moveLayer("areal-dynamics-outline");
}

/** Добавляет на карту слой динамики ареала (изначально пустой). */
export function addArealDynamicsLayer(map) {
  ensureArealDynamicsLayers(map);
}

export function syncArealDynamicsLayer(map, slices) {
  ensureArealDynamicsLayers(map);

  const source = map.getSource(SOURCE_ID);

  if (!source) {
    return;
  }

  const features = slices
    .map((slice) => slice.geometry)
    .filter(Boolean);

  source.setData({
    type: "FeatureCollection",
    features
  });

  moveArealDynamicsLayersToTop(map);
}

export function clearArealDynamicsLayer(map) {
  syncArealDynamicsLayer(map, []);
}
