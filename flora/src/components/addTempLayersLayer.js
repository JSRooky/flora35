import { getPointColorExpression } from "./pointColors";
import { getVisibleTempLayerFeatures } from "../tempLayers/tempLayerStore";

export const TEMP_LAYERS_SOURCE_ID = "temp-layers";
export const TEMP_LAYERS_LAYER_ID = "temp-layers-unclustered";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

let layerVisible = false;
let onPointClickCallback = null;
let interactionHandlers = null;

function applyVisibility(map) {
  if (!map?.getLayer?.(TEMP_LAYERS_LAYER_ID)) {
    return;
  }
  map.setLayoutProperty(
    TEMP_LAYERS_LAYER_ID,
    "visibility",
    layerVisible ? "visible" : "none"
  );
}

function detachInteractions(map) {
  if (!interactionHandlers || !map) {
    return;
  }

  const { pointClick, pointEnter, pointLeave } = interactionHandlers;
  if (map.getLayer(TEMP_LAYERS_LAYER_ID)) {
    map.off("click", TEMP_LAYERS_LAYER_ID, pointClick);
    map.off("mouseenter", TEMP_LAYERS_LAYER_ID, pointEnter);
    map.off("mouseleave", TEMP_LAYERS_LAYER_ID, pointLeave);
  }
  interactionHandlers = null;
}

function attachInteractions(map) {
  detachInteractions(map);

  const pointClick = (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }
    event.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    onPointClickCallback?.(feature);
  };

  const pointEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const pointLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  map.on("click", TEMP_LAYERS_LAYER_ID, pointClick);
  map.on("mouseenter", TEMP_LAYERS_LAYER_ID, pointEnter);
  map.on("mouseleave", TEMP_LAYERS_LAYER_ID, pointLeave);

  interactionHandlers = { pointClick, pointEnter, pointLeave };
}

export function setTempLayersData(map) {
  if (!map?.getSource) {
    return;
  }

  const collection = {
    type: "FeatureCollection",
    features: getVisibleTempLayerFeatures()
  };

  const source = map.getSource(TEMP_LAYERS_SOURCE_ID);
  if (source) {
    source.setData(collection);
    applyVisibility(map);
    return;
  }

  if (!map.getStyle()) {
    return;
  }

  map.addSource(TEMP_LAYERS_SOURCE_ID, {
    type: "geojson",
    data: collection
  });

  map.addLayer({
    id: TEMP_LAYERS_LAYER_ID,
    type: "circle",
    source: TEMP_LAYERS_SOURCE_ID,
    paint: {
      "circle-color": getPointColorExpression(),
      "circle-radius": 5,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff"
    }
  });

  attachInteractions(map);
  applyVisibility(map);
}

export function addTempLayersLayer(map, { onPointClick } = {}) {
  if (!map) {
    return;
  }
  if (onPointClick) {
    onPointClickCallback = onPointClick;
  }
  setTempLayersData(map);
}

export function setTempLayersVisibility(map, visible) {
  layerVisible = Boolean(visible);
  if (!map) {
    return;
  }
  if (!map.getSource(TEMP_LAYERS_SOURCE_ID)) {
    if (layerVisible) {
      setTempLayersData(map);
    }
    return;
  }
  applyVisibility(map);
}

export function getTempLayersInteractiveLayerIds() {
  return [TEMP_LAYERS_LAYER_ID];
}

export function clearTempLayersLayer(map) {
  if (!map) {
    return;
  }
  detachInteractions(map);
  if (map.getLayer(TEMP_LAYERS_LAYER_ID)) {
    map.removeLayer(TEMP_LAYERS_LAYER_ID);
  }
  if (map.getSource(TEMP_LAYERS_SOURCE_ID)) {
    map.removeSource(TEMP_LAYERS_SOURCE_ID);
  }
}

export function isTempLayersVisible() {
  return layerVisible;
}

void EMPTY_COLLECTION;
