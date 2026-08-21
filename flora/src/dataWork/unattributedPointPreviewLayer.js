import maplibregl from "../map/mapEngine";
import { getFeatureCoordinates } from "../components/spreadCoincidentPoints";
import pairPinUrl from "../images/pair_pin.svg";

const PIN_SIZE_PX = 32;
const PIN_ANCHOR_OFFSET_Y_PX = 4;

/** @type {import("maplibre-gl").Marker|null} */
let previewMarker = null;

function getPointCoordinates(row) {
  const feature = row?.feature;
  const coordinates =
    getFeatureCoordinates(feature) ??
    (Array.isArray(row?.coordinates) ? row.coordinates : null);

  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  return [coordinates[0], coordinates[1]];
}

function createPinElement() {
  const element = document.createElement("img");
  element.src = pairPinUrl;
  element.alt = "";
  element.width = PIN_SIZE_PX;
  element.height = PIN_SIZE_PX;
  element.draggable = false;
  element.style.display = "block";
  element.style.pointerEvents = "none";
  return element;
}

function removePreviewMarker() {
  if (previewMarker) {
    previewMarker.remove();
    previewMarker = null;
  }
}

/**
 * Рисует одну точку красным пином (без кластеризации).
 * @param {import("maplibre-gl").Map|null|undefined} map
 * @param {{ feature?: object, coordinates?: number[] }|null|undefined} row
 */
export function showUnattributedPointPreview(map, row) {
  if (!map?.getStyle?.()) {
    return;
  }

  removePreviewMarker();

  const coordinates = getPointCoordinates(row);
  if (!coordinates) {
    return;
  }

  previewMarker = new maplibregl.Marker({
    element: createPinElement(),
    anchor: "bottom",
    offset: [0, PIN_ANCHOR_OFFSET_Y_PX]
  })
    .setLngLat(coordinates)
    .addTo(map);
}

/** Удаляет маркер превью. */
export function clearUnattributedPointPreview(map) {
  removePreviewMarker();
  void map;
}
