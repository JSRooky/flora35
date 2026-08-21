import maplibregl from "../map/mapEngine";
import { applyBasemapLanguage } from "../map/applyBasemapLanguage";
import { sanitizeMapboxStyle, transformMapboxUrl } from "../map/transformMapboxRequest";
import { installSafeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";

const MAPBOX_STYLE_URL = "mapbox://styles/epoxyde/cmrj0xcli00b501si30ge42bj";

export const DEFAULT_MAP_CENTER = [40.65, 59.21];
export const DEFAULT_MAP_ZOOM = 6.2;

function getMapboxAccessToken() {
  return process.env.REACT_APP_MAPBOX_TOKEN?.trim() || "";
}

/** Создаёт экземпляр карты MapLibre с подложкой Mapbox (Вологодская область). */
export async function initMap(container) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) {
    throw new Error(
      "Не задан REACT_APP_MAPBOX_TOKEN. Скопируйте flora/.env.example в flora/.env.local, укажите токен Mapbox и перезапустите npm start."
    );
  }

  const styleRequest = transformMapboxUrl(MAPBOX_STYLE_URL, "Style", accessToken);
  const styleResponse = await fetch(styleRequest.url);
  if (!styleResponse.ok) {
    throw new Error(`Не удалось загрузить стиль Mapbox (${styleResponse.status})`);
  }
  const style = sanitizeMapboxStyle(undefined, await styleResponse.json());

  // React Strict Mode может повторно смонтировать контейнер с остатками canvas.
  if (container && container.childNodes.length > 0) {
    container.replaceChildren();
  }

  const map = new maplibregl.Map({
    container,
    style,
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    transformRequest: (url, resourceType) => transformMapboxUrl(url, resourceType, accessToken)
  });

  map.once("style.load", () => {
    applyBasemapLanguage(map, "ru");
  });

  // Внутренние mousemove/click тоже зовут queryRenderedFeatures —
  // без патча падают с «feature index out of bounds» при обновлении тайлов.
  installSafeQueryRenderedFeatures(map);

  return map;
}
