/**
 * Общий реестр регионов для загрузки внешних источников (GBIF, iNaturalist).
 */

export const EXTERNAL_REGIONS = [
  {
    id: "vologda",
    label: "Вологодская область",
    gbif: { gadmGid: "RUS.78_1" },
    inaturalist: { placeId: 134604 }
  }
];

export const DEFAULT_EXTERNAL_REGION_ID = "vologda";

/** @deprecated Используйте EXTERNAL_REGIONS */
export const GBIF_REGIONS = EXTERNAL_REGIONS;

/** @deprecated Используйте DEFAULT_EXTERNAL_REGION_ID */
export const DEFAULT_GBIF_REGION_ID = DEFAULT_EXTERNAL_REGION_ID;

export function getExternalRegionById(id) {
  return EXTERNAL_REGIONS.find((region) => region.id === id) ?? null;
}

/** @deprecated Используйте getExternalRegionById */
export function getGbifRegionById(id) {
  return getExternalRegionById(id);
}

export function getDefaultExternalRegion() {
  return getExternalRegionById(DEFAULT_EXTERNAL_REGION_ID) ?? EXTERNAL_REGIONS[0];
}

/** @deprecated Используйте getDefaultExternalRegion */
export function getDefaultGbifRegion() {
  return getDefaultExternalRegion();
}

/** Параметры пространственного фильтра для GBIF Occurrence Search. */
export function toGbifSpatialRegion(region) {
  if (!region) {
    return null;
  }

  if (region.gbif) {
    return { id: region.id, ...region.gbif };
  }

  return region;
}

/** Параметры пространственного фильтра для iNaturalist Observations API. */
export function toInatSpatialRegion(region) {
  if (!region) {
    return null;
  }

  if (region.inaturalist) {
    return { id: region.id, ...region.inaturalist };
  }

  return null;
}
