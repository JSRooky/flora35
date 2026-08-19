import { applyRegionStylePaint } from "./addRegionBoundsLayer";
import {
  getVisibleRegionOverlayEditState,
  getVisibleTempLayerOverlays,
  isRegionOverlayBufferFeature
} from "../tempLayers/tempLayerStore";

export const TEMP_OVERLAY_SOURCE_ID = "temp-layer-overlays";
export const TEMP_OVERLAY_FILL_LAYER_ID = "temp-layer-overlays-fill";
export const TEMP_OVERLAY_LINE_LAYER_ID = "temp-layer-overlays-line";

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

function applyPropertyBasedOverlayPaint(map) {
  if (map.getLayer(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.setPaintProperty(TEMP_OVERLAY_FILL_LAYER_ID, "fill-color", FILL_COLOR);
    map.setPaintProperty(TEMP_OVERLAY_FILL_LAYER_ID, "fill-opacity", [
      "coalesce",
      ["get", "fillOpacity"],
      0.2
    ]);
  }
  if (map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
    map.setPaintProperty(TEMP_OVERLAY_LINE_LAYER_ID, "line-color", FILL_COLOR);
    map.setPaintProperty(TEMP_OVERLAY_LINE_LAYER_ID, "line-width", 1.4);
    map.setPaintProperty(TEMP_OVERLAY_LINE_LAYER_ID, "line-opacity", 0.85);
  }
}

export function applyTempRegionOverlayPaint(map, { settings, featureColors } = {}) {
  if (!map?.getLayer) {
    return;
  }
  if (!settings) {
    applyPropertyBasedOverlayPaint(map);
    return;
  }
  applyRegionStylePaint(map, {
    fillLayerId: TEMP_OVERLAY_FILL_LAYER_ID,
    lineLayerId: TEMP_OVERLAY_LINE_LAYER_ID,
    settings,
    colorsByIso: featureColors
  });
}

export function addTempLayerOverlaysLayer(map) {
  if (!map?.getSource || map.getSource(TEMP_OVERLAY_SOURCE_ID)) {
    return;
  }

  map.addSource(TEMP_OVERLAY_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_COLLECTION
  });

  map.addLayer({
    id: TEMP_OVERLAY_FILL_LAYER_ID,
    type: "fill",
    source: TEMP_OVERLAY_SOURCE_ID,
    paint: {
      "fill-color": FILL_COLOR,
      "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2]
    }
  });

  map.addLayer({
    id: TEMP_OVERLAY_LINE_LAYER_ID,
    type: "line",
    source: TEMP_OVERLAY_SOURCE_ID,
    paint: {
      "line-color": FILL_COLOR,
      "line-width": 1.4,
      "line-opacity": 0.85
    }
  });
}

export function setTempLayerOverlaysData(map, { visible = true, regionSettings = null } = {}) {
  if (!map?.getSource) {
    return;
  }

  addTempLayerOverlaysLayer(map);
  const source = map.getSource(TEMP_OVERLAY_SOURCE_ID);
  if (!source) {
    return;
  }

  if (!visible) {
    source.setData(EMPTY_COLLECTION);
    return;
  }

  const edit = getVisibleRegionOverlayEditState();
  const features = getVisibleTempLayerOverlays().flatMap((overlay) => {
    const list = overlay.features ?? [];
    if (overlay.kind !== "regions") {
      return list;
    }
    return list.filter((feature) => !isRegionOverlayBufferFeature(feature));
  });
  source.setData({
    type: "FeatureCollection",
    features
  });

  const settings = regionSettings || edit.style;
  if (edit.active && settings) {
    applyTempRegionOverlayPaint(map, {
      settings,
      featureColors: edit.featureColors
    });
  } else {
    applyPropertyBasedOverlayPaint(map);
  }
}
