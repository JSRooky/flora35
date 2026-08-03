import { getFeatureCollection } from "../locations/loadPoints";

/** Минимальный и максимальный год находки среди всех точек данных. */
export function getYearBounds() {
  const years = getFeatureCollection().features
    .map((feature) => feature.properties?.found_year)
    .filter((year) => typeof year === "number" && Number.isFinite(year));

  if (years.length === 0) {
    const currentYear = new Date().getFullYear();
    return { min: currentYear, max: currentYear };
  }

  return {
    min: Math.min(...years),
    max: Math.max(...years)
  };
}
