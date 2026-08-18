import { getFirstLocationsLayerId } from "./addLocationsLayer";
import russiaRegions from "../geo/russiaRegions.json";

export const REGION_BOUNDS_SOURCE_ID = "region-bounds";
export const REGION_BOUNDS_FILL_LAYER_ID = "region-bounds-fill";
export const REGION_BOUNDS_OUTLINE_LAYER_ID = "region-bounds-outline";

function setRegionBoundsVisibility(map, visible) {
  const visibility = visible ? "visible" : "none";
  [REGION_BOUNDS_FILL_LAYER_ID, REGION_BOUNDS_OUTLINE_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

/** Добавляет контуры субъектов РФ. По умолчанию слой скрыт. */
export function addRegionBoundsLayer(map) {
  if (!map) {
    return;
  }

  if (!map.getSource(REGION_BOUNDS_SOURCE_ID)) {
    map.addSource(REGION_BOUNDS_SOURCE_ID, {
      type: "geojson",
      data: russiaRegions
    });
  }

  const beforeId = getFirstLocationsLayerId(map);

  if (!map.getLayer(REGION_BOUNDS_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: REGION_BOUNDS_FILL_LAYER_ID,
        type: "fill",
        source: REGION_BOUNDS_SOURCE_ID,
        layout: {
          visibility: "none"
        },
        paint: {
          "fill-color": "#7a5a2d",
          "fill-opacity": 0.05,
          "fill-antialias": true
        }
      },
      beforeId
    );
  }

  if (!map.getLayer(REGION_BOUNDS_OUTLINE_LAYER_ID)) {
    map.addLayer(
      {
        id: REGION_BOUNDS_OUTLINE_LAYER_ID,
        type: "line",
        source: REGION_BOUNDS_SOURCE_ID,
        layout: {
          visibility: "none"
        },
        paint: {
          "line-color": "#6b4f2a",
          "line-width": 1.1,
          "line-opacity": 0.85
        }
      },
      beforeId
    );
  }
}

/** Включает или выключает контуры регионов. */
export function setRegionBoundsEnabled(map, enabled) {
  if (!map) {
    return;
  }

  addRegionBoundsLayer(map);
  setRegionBoundsVisibility(map, enabled);
}
