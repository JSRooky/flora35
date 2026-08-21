/**
 * Приближает карту так, чтобы были видны обе точки [lng, lat].
 * При совпадении координат — easeTo к точке.
 *
 * @param {import("maplibre-gl").Map|null|undefined} map
 * @param {number[]} leftCoordinates
 * @param {number[]} rightCoordinates
 * @param {{ padding?: number, maxZoom?: number, duration?: number }} [options]
 */
export function fitMapToCoordinatePair(map, leftCoordinates, rightCoordinates, options = {}) {
  if (!map?.getStyle?.()) {
    return;
  }

  if (
    !Array.isArray(leftCoordinates) ||
    leftCoordinates.length < 2 ||
    !Number.isFinite(leftCoordinates[0]) ||
    !Number.isFinite(leftCoordinates[1]) ||
    !Array.isArray(rightCoordinates) ||
    rightCoordinates.length < 2 ||
    !Number.isFinite(rightCoordinates[0]) ||
    !Number.isFinite(rightCoordinates[1])
  ) {
    return;
  }

  const {
    padding = 80,
    maxZoom = 17,
    duration = 900
  } = options;

  const samePoint =
    leftCoordinates[0] === rightCoordinates[0] &&
    leftCoordinates[1] === rightCoordinates[1];

  if (samePoint) {
    map.easeTo({
      center: leftCoordinates,
      zoom: Math.max(map.getZoom(), 15),
      duration
    });
    return;
  }

  const west = Math.min(leftCoordinates[0], rightCoordinates[0]);
  const south = Math.min(leftCoordinates[1], rightCoordinates[1]);
  const east = Math.max(leftCoordinates[0], rightCoordinates[0]);
  const north = Math.max(leftCoordinates[1], rightCoordinates[1]);

  map.fitBounds(
    [
      [west, south],
      [east, north]
    ],
    {
      padding,
      maxZoom,
      duration
    }
  );
}
