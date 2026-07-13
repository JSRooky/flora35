import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

export function initMap(container) {
  return new mapboxgl.Map({
    container,
    style: "mapbox://styles/epoxyde/cmrj0xcli00b501si30ge42bj",
    center: [40.65, 59.21],
    zoom: 6.2
  });
}

