/** Режимы подложки карты. */
export const BASEMAP_MODES = {
  MAPBOX: "mapbox",
  OSM: "osm",
  YANDEX: "yandex"
};

export const BASEMAP_OPTIONS = [
  {
    value: BASEMAP_MODES.MAPBOX,
    label: "Mapbox",
    title: "Mapbox"
  },
  {
    value: BASEMAP_MODES.OSM,
    label: "OpenStreetMap",
    title: "OpenStreetMap"
  },
  {
    value: BASEMAP_MODES.YANDEX,
    label: "Яндекс Карты",
    title: "Яндекс Карты"
  }
];
