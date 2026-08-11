import { setGbifData } from "../components/addGbifLayer";
import { setInatData } from "../components/addInatLayer";
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
 * РћСЃС‚Р°РІР»СЏРµС‚ РЅР° РєР°СЂС‚Рµ С‚РѕР»СЊРєРѕ РїР°СЂСѓ С‚РѕС‡РµРє: РѕСЃС‚Р°Р»СЊРЅС‹Рµ СЃР»РѕРё РѕС‡РёС‰Р°СЋС‚СЃСЏ,
 * РїР°СЂР° СЂРёСЃСѓРµС‚СЃСЏ РЅР° РѕС‚РґРµР»СЊРЅРѕРј preview-СЃР»РѕРµ (РІСЃРµРіРґР° РІРёРґРёРјРѕРј).
 * @param {import("mapbox-gl").Map|null|undefined} map
 * @param {{ left?: object, right?: object }|null|undefined} match
 */
export function isolateNearSpeciesPairOnMap(map, match) {
  if (!map) {
    return;
  }

  // РЎРєСЂС‹РІР°РµРј РѕР±С‹С‡РЅС‹Рµ С‚РѕС‡РєРё РёСЃС‚РѕС‡РЅРёРєРѕРІ, С‡С‚РѕР±С‹ РЅРµ РјРµС€Р°Р»Рё РїСЂРµРІСЊСЋ.
  setGbifData(map, EMPTY_COLLECTION, { preview: true });
  setInatData(map, EMPTY_COLLECTION, { preview: true });
  setTemporaryLocationsFeatures(map, []);
  setHeatmapFeatures(map, []);

  showNearSpeciesPairPreview(map, match);
}

/**
 * Р’РѕР·РІСЂР°С‰Р°РµС‚ СЃР»РѕРё С‚РѕС‡РµРє Рє СЃРѕСЃС‚РѕСЏРЅРёСЋ РїРѕ С‚РµРєСѓС‰РёРј С„РёР»СЊС‚СЂР°Рј.
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
  refreshLocationsFromCurrentFilters(map);
  updateHeatmapData(map, locationFilters);
}

