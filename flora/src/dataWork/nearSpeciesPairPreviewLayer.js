import mapboxgl from "mapbox-gl";
import { getFeatureCoordinates } from "../components/spreadCoincidentPoints";
import pairPinUrl from "../images/pair_pin.svg";

const PAIR_PIN_SIZE_PX = 32;
const PAIR_PIN_ANCHOR_OFFSET_Y_PX = 4;

/** @type {import("mapbox-gl").Marker[]} */
let pairPinMarkers = [];

function getPointCoordinates(point) {
  const feature = point?.feature;
  const coordinates =
    getFeatureCoordinates(feature) ??
    (Array.isArray(point?.coordinates) ? point.coordinates : null);

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

function createPairPinElement() {
  const element = document.createElement("img");
  element.src = pairPinUrl;
  element.alt = "";
  element.width = PAIR_PIN_SIZE_PX;
  element.height = PAIR_PIN_SIZE_PX;
  element.draggable = false;
  element.style.display = "block";
  element.style.pointerEvents = "none";
  return element;
}

function removePairPinMarkers() {
  pairPinMarkers.forEach((marker) => {
    marker.remove();
  });
  pairPinMarkers = [];
}

/**
 * Рисует пару точек уникальными красными пинами (без кластеризации).
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {{ left?: object, right?: object }|null|undefined} match
 */
export function showNearSpeciesPairPreview(map, match) {
  if (!map?.getStyle?.()) {
    return;
  }

  removePairPinMarkers();

  const points = [match?.left, match?.right];

  points.forEach((point) => {
    const coordinates = getPointCoordinates(point);
    if (!coordinates) {
      return;
    }

    const marker = new mapboxgl.Marker({
      element: createPairPinElement(),
      anchor: "bottom",
      offset: [0, PAIR_PIN_ANCHOR_OFFSET_Y_PX]
    })
      .setLngLat(coordinates)
      .addTo(map);

    pairPinMarkers.push(marker);
  });
}

/** Удаляет маркеры превью пары. */
export function clearNearSpeciesPairPreview(map) {
  removePairPinMarkers();

  // map может быть null при размонтировании — маркеры уже сняты.
  void map;
}
