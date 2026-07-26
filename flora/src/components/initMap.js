import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Токен берётся из .env (REACT_APP_MAPBOX_TOKEN).
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

/** Создаёт экземпляр карты Mapbox с начальным видом на Вологодскую область. */
export function initMap(container) {
  return new mapboxgl.Map({
    container,
    style: "mapbox://styles/epoxyde/cmrj0xcli00b501si30ge42bj",
    center: [40.65, 59.21],
    zoom: 6.2
  });
}

