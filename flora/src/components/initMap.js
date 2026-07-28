import mapboxgl from "mapbox-gl/dist/mapbox-gl-csp";
import "mapbox-gl/dist/mapbox-gl.css";

// CRA must load the Mapbox worker via worker-loader; direct imports break in production.
mapboxgl.workerClass = require("worker-loader!mapbox-gl/dist/mapbox-gl-csp-worker").default; // eslint-disable-line import/no-webpack-loader-syntax

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
