const EARTH_RADIUS_KM = 6371;

/**
 * Расстояние между двумя точками [lng, lat] по поверхности Земли, в км.
 * @param {number[]} center
 * @param {number[]} point
 * @returns {number}
 */
export function getHaversineDistanceKm(center, point) {
  const [lng1, lat1] = center;
  const [lng2, lat2] = point;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
