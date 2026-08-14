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
  clearUnattributedPointPreview,
  showUnattributedPointPreview
} from "./unattributedPointPreviewLayer";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

/**
 * Оставляет на карте только выбранную точку: остальные слои очищаются,
 * точка рисуется на отдельном preview-маркере.
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {{ feature?: object, coordinates?: number[] }|null|undefined} row
 */
export function isolateUnattributedPointOnMap(map, row) {
  if (!map) {
    return;
  }

  setGbifData(map, EMPTY_COLLECTION, { preview: true });
  setInatData(map, EMPTY_COLLECTION, { preview: true });
  setMergedData(map, EMPTY_COLLECTION, { preview: true });
  setTemporaryLocationsFeatures(map, []);
  setHeatmapFeatures(map, []);

  showUnattributedPointPreview(map, row);
}

/**
 * Возвращает слои точек к состоянию по текущим фильтрам.
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {object} [locationFilters]
 */
export function restoreUnattributedMapLayers(map, locationFilters = {}) {
  if (!map) {
    return;
  }

  clearUnattributedPointPreview(map);
  applyGbifLocationsFilter(map, locationFilters);
  applyInatLocationsFilter(map, locationFilters);
  setMergedData(map, getMergedFeatureCollection());
  refreshLocationsFromCurrentFilters(map);
  updateHeatmapData(map, locationFilters);
}
