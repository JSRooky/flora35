import { applyRegionStylePaint, emitRegionBoundsSelect, getRegionEntryByIso, REGION_BOUNDS_FILL_LAYER_ID } from "./addRegionBoundsLayer";
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

const overlaySelectAttachedMaps = new WeakSet();

function overlayBeforeId(map) {
  return map.getLayer(REGION_BOUNDS_FILL_LAYER_ID) ? REGION_BOUNDS_FILL_LAYER_ID : undefined;
}

function attachOverlaySelectHandlers(map) {
  if (overlaySelectAttachedMaps.has(map) || !map?.getLayer?.(TEMP_OVERLAY_FILL_LAYER_ID)) {
    return;
  }
  overlaySelectAttachedMaps.add(map);
  map.on("click", TEMP_OVERLAY_FILL_LAYER_ID, (event) => {
    const feature = event.features?.[0];
    const iso = feature?.properties?.iso || feature?.properties?.ISO_1;
    if (!iso) {
      return;
    }
    event.preventDefault?.();
    const entry = getRegionEntryByIso(iso) ?? {
      iso: String(iso),
      name: feature.properties?.name || feature.properties?.name_en || String(iso),
      nameEn: feature.properties?.name_en || "",
      fo: feature.properties?.fo || "Прочие",
      feature
    };
    emitRegionBoundsSelect(entry, event.lngLat);
  });
}

function placeOverlayBelowRegionBounds(map) {
  const beforeId = overlayBeforeId(map);
  if (!beforeId) {
    return;
  }
  if (map.getLayer(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.moveLayer(TEMP_OVERLAY_FILL_LAYER_ID, beforeId);
  }
  if (map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
    map.moveLayer(TEMP_OVERLAY_LINE_LAYER_ID, beforeId);
  }
}

export function addTempLayerOverlaysLayer(map) {
  if (!map?.getSource) {
    return;
  }

  const beforeId = overlayBeforeId(map);

  if (!map.getSource(TEMP_OVERLAY_SOURCE_ID)) {
    map.addSource(TEMP_OVERLAY_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION
    });
  }

  if (!map.getLayer(TEMP_OVERLAY_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: TEMP_OVERLAY_FILL_LAYER_ID,
        type: "fill",
        source: TEMP_OVERLAY_SOURCE_ID,
        paint: {
          "fill-color": FILL_COLOR,
          "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2]
        }
      },
      beforeId
    );
  }

  if (!map.getLayer(TEMP_OVERLAY_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: TEMP_OVERLAY_LINE_LAYER_ID,
        type: "line",
        source: TEMP_OVERLAY_SOURCE_ID,
        paint: {
          "line-color": FILL_COLOR,
          "line-width": 1.4,
          "line-opacity": 0.85
        }
      },
      beforeId
    );
  }

  placeOverlayBelowRegionBounds(map);
  attachOverlaySelectHandlers(map);
}

export function setTempLayerOverlaysData(map, { regionSettings = null } = {}) {
  if (!map?.getSource) {
    return;
  }

  addTempLayerOverlaysLayer(map);
  const source = map.getSource(TEMP_OVERLAY_SOURCE_ID);
  if (!source) {
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

  const overlayVisibility = features.length > 0 ? "visible" : "none";
  [TEMP_OVERLAY_FILL_LAYER_ID, TEMP_OVERLAY_LINE_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", overlayVisibility);
    }
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
