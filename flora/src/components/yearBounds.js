import points from "../locations/points.json";

/** Минимальный и максимальный год находки среди всех точек данных. */
export function getYearBounds() {
  const years = points.features
    .map((feature) => feature.properties.found_year)
    .filter((year) => typeof year === "number");

  return {
    min: Math.min(...years),
    max: Math.max(...years)
  };
}
