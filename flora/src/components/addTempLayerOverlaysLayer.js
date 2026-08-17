import { getVisibleTempLayerOverlays } from "../tempLayers/tempLayerStore";

const SOURCE_ID = "temp-layer-overlays";
const FILL_LAYER_ID = "temp-layer-overlays-fill";
const LINE_LAYER_ID = "temp-layer-overlays-line";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const FILL_COLOR = [
  "coalesce",
  ["get", "color"],
  ["get", "outlineColor"],
  "#3498db"
];

export function addTempLayerOverlaysLayer(map) {
  if (!map?.getSource || map.getSource(SOURCE_ID)) {
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": FILL_COLOR,
      "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2]
    }
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": FILL_COLOR,
      "line-width": 1.4,
      "line-opacity": 0.85
    }
  });
}

export function setTempLayerOverlaysData(map, { visible = true } = {}) {
  if (!map?.getSource) {
    return;
  }

  addTempLayerOverlaysLayer(map);
  const source = map.getSource(SOURCE_ID);
  if (!source) {
    return;
  }

  if (!visible) {
    source.setData(EMPTY_COLLECTION);
    return;
  }

  const features = getVisibleTempLayerOverlays().flatMap(
    (overlay) => overlay.features ?? []
  );
  source.setData({
    type: "FeatureCollection",
    features
  });
}
