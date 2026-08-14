const SOURCE_ID = "osm";
const LAYER_ID = "osm-raster";

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** @type {WeakMap<import("mapbox-gl").Map, { layerIds: string[], visibility: Map<string, string> }>} */
const mapState = new WeakMap();

function getState(map) {
  if (!mapState.has(map)) {
    mapState.set(map, { layerIds: [], visibility: new Map() });
  }
  return mapState.get(map);
}

/** Запоминает id слоёв текущего Mapbox-стиля до добавления пользовательских слоёв. */
function captureMapboxBasemapLayers(map) {
  const state = getState(map);
  if (state.layerIds.length > 0) {
    return;
  }

  const layers = map.getStyle()?.layers;
  if (!layers?.length) {
    return;
  }

  state.layerIds = layers.map((layer) => layer.id);
  state.layerIds.forEach((id) => {
    state.visibility.set(id, map.getLayoutProperty(id, "visibility") ?? "visible");
  });
}

/** Добавляет растровый слой OSM вниз стека (по умолчанию скрыт). */
export function addOsmBasemapLayer(map) {
  if (!map?.getSource || map.getSource(SOURCE_ID)) {
    return;
  }

  captureMapboxBasemapLayers(map);

  map.addSource(SOURCE_ID, {
    type: "raster",
    tiles: [OSM_TILE_URL],
    tileSize: 256,
    attribution: "© OpenStreetMap contributors"
  });

  const firstLayerId = map.getStyle()?.layers?.[0]?.id;

  map.addLayer(
    {
      id: LAYER_ID,
      type: "raster",
      source: SOURCE_ID,
      layout: {
        visibility: "none"
      }
    },
    firstLayerId
  );
}

function setMapboxBasemapVisible(map, visible) {
  const { layerIds, visibility } = getState(map);

  layerIds.forEach((id) => {
    if (!map.getLayer(id)) {
      return;
    }

    map.setLayoutProperty(
      id,
      "visibility",
      visible ? (visibility.get(id) ?? "visible") : "none"
    );
  });
}

/** Переключает подложку OpenStreetMap, скрывая/восстанавливая слои Mapbox-стиля. */
export function setOsmBasemapEnabled(map, enabled) {
  if (!map?.getLayer) {
    return;
  }

  if (!map.getLayer(LAYER_ID)) {
    addOsmBasemapLayer(map);
  }

  if (!map.getLayer(LAYER_ID)) {
    return;
  }

  setMapboxBasemapVisible(map, !enabled);
  map.setLayoutProperty(LAYER_ID, "visibility", enabled ? "visible" : "none");
}
