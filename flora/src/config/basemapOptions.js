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
    title: "Стандартная подложка Mapbox"
  },
  {
    value: BASEMAP_MODES.OSM,
    label: "OpenStreetMap",
    title: "Подложка OpenStreetMap"
  },
  {
    value: BASEMAP_MODES.YANDEX,
    label: "Яндекс Карты",
    title: "Подложка Яндекс Карт (Tiles API)"
  }
];
