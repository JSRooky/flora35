import mapboxgl from "mapbox-gl/dist/mapbox-gl-csp";
import "mapbox-gl/dist/mapbox-gl.css";
import { installSafeQueryRenderedFeatures } from "./safeQueryRenderedFeatures";

// CRA must load the Mapbox worker via worker-loader; direct imports break in production.
mapboxgl.workerClass = require("worker-loader!mapbox-gl/dist/mapbox-gl-csp-worker").default; // eslint-disable-line import/no-webpack-loader-syntax

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN?.trim() || "";

export const DEFAULT_MAP_CENTER = [40.65, 59.21];
export const DEFAULT_MAP_ZOOM = 6.2;

/** Создаёт экземпляр карты Mapbox с начальным видом на Вологодскую область. */
export function initMap(container) {
  if (!mapboxgl.accessToken) {
    throw new Error(
      "Не задан REACT_APP_MAPBOX_TOKEN. Скопируйте flora/.env.example в flora/.env.local, укажите токен Mapbox и перезапустите npm start."
    );
  }

  // React Strict Mode может повторно смонтировать контейнер с остатками canvas —
  // очищаем, чтобы Mapbox не ругался «container should be empty».
  if (container && container.childNodes.length > 0) {
    container.replaceChildren();
  }

  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/epoxyde/cmrj0xcli00b501si30ge42bj",
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    // Подписи Mapbox Streets: русский, иначе локальное имя объекта.
    language: "ru"
  });

  // Внутренние mousemove/click Mapbox тоже зовут queryRenderedFeatures —
  // без патча падают с «feature index out of bounds» при обновлении тайлов.
  installSafeQueryRenderedFeatures(map);

  return map;
}
