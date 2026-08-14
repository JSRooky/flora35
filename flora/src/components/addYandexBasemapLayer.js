const SOURCE_ID = "yandex";
const LAYER_ID = "yandex-raster";
const YANDEX_LAYER_TYPE = "map";

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

/** Возвращает URL шаблона тайлов или null, если API-ключ не задан. */
export function getYandexTileUrl() {
  const apiKey = process.env.REACT_APP_YANDEX_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return (
    "https://tiles.api-maps.yandex.ru/v1/tiles/" +
    `?apikey=${encodeURIComponent(apiKey)}` +
    `&l=${YANDEX_LAYER_TYPE}` +
    "&lang=ru_RU" +
    "&z={z}&x={x}&y={y}" +
    "&projection=web_mercator"
  );
}

/** Проверяет, задан ли API-ключ Яндекс Карт в окружении сборки. */
export function isYandexMapsApiKeyConfigured() {
  return Boolean(process.env.REACT_APP_YANDEX_MAPS_API_KEY?.trim());
}

/** Добавляет растровый слой Яндекс Карт вниз стека (по умолчанию скрыт). */
export function addYandexBasemapLayer(map) {
  if (!map?.getSource) {
    return;
  }

  const tileUrl = getYandexTileUrl();
  if (!tileUrl) {
    return;
  }

  captureMapboxBasemapLayers(map);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      attribution: "© Яндекс"
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
    return;
  }

  map.getSource(SOURCE_ID).setTiles([tileUrl]);
}

/** Переключает подложку Яндекс Карт, скрывая/восстанавливая слои Mapbox-стиля. */
export function setYandexBasemapEnabled(map, enabled) {
  if (!map?.getLayer || !isYandexMapsApiKeyConfigured()) {
    return;
  }

  if (!map.getLayer(LAYER_ID)) {
    addYandexBasemapLayer(map);
  }

  if (!map.getLayer(LAYER_ID)) {
    return;
  }

  setMapboxBasemapVisible(map, !enabled);
  map.setLayoutProperty(LAYER_ID, "visibility", enabled ? "visible" : "none");
}
