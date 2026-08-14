import { setGbifData } from "../components/addGbifLayer";
import { setInatData } from "../components/addInatLayer";
import { setMergedData, getMergedFeatureCollection } from "../components/addMergedLayer";
import { setHeatmapFeatures, updateHeatmapData } from "../components/addHeatmapLayer";
import {
  applyGbifLocationsFilter,
  applyInatLocationsFilter,
  refreshLocationsFromCurrentFilters,
  setTemporaryLocationsFeatures
} from "../components/addLocationsLayer";
import {
  clearNearSpeciesPairPreview,
  showNearSpeciesPairPreview
} from "./nearSpeciesPairPreviewLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

/**
 * Оставляет на карте только пару точек: остальные слои очищаются,
 * пара рисуется на отдельном preview-слое (всегда видимом).
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {{ left?: object, right?: object }|null|undefined} match
 */
export function isolateNearSpeciesPairOnMap(map, match) {
  if (!map) {
    return;
  }

  setGbifData(map, EMPTY_COLLECTION, { preview: true });
  setInatData(map, EMPTY_COLLECTION, { preview: true });
  setMergedData(map, EMPTY_COLLECTION, { preview: true });
  setTemporaryLocationsFeatures(map, []);
  setHeatmapFeatures(map, []);

  showNearSpeciesPairPreview(map, match);
}

/**
 * Возвращает слои точек к состоянию по текущим фильтрам.
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {object} [locationFilters]
 */
export function restoreNearSpeciesMapLayers(map, locationFilters = {}) {
  if (!map) {
    return;
  }

  clearNearSpeciesPairPreview(map);
  applyGbifLocationsFilter(map, locationFilters);
  applyInatLocationsFilter(map, locationFilters);
  setMergedData(map, getMergedFeatureCollection());
  refreshLocationsFromCurrentFilters(map);
  updateHeatmapData(map, locationFilters);
}
