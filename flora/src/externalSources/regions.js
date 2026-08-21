/**
 * Общий реестр регионов для загрузки внешних источников (GBIF, iNaturalist).
 * Базовый список — субъекты РФ из GADM 4.1; placeId iNaturalist — в russiaRegionsGadm.json.
 */

import russiaRegionsGadm from "./russiaRegionsGadm.json";

/** Дополнительные / устаревшие placeId iNaturalist (перекрывают JSON при необходимости). */
const INAT_PLACE_ID_OVERRIDES = {
  vologda: 134604
};

export const EXTERNAL_REGIONS = russiaRegionsGadm.map((region) => {
  const overrideId = INAT_PLACE_ID_OVERRIDES[region.id];
  const placeId =
    overrideId != null ? overrideId : region.inaturalist?.placeId ?? null;

  if (placeId == null) {
    return {
      ...region,
      inaturalist: { placeId: null }
    };
  }

  return {
    ...region,
    inaturalist: { placeId }
  };
});

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

/**
 * Параметры пространственного фильтра для iNaturalist Observations API.
 * Принимает и полный регистр (inaturalist.placeId), и уже нормализованный
 * объект { id, placeId } / { id, bbox } после предыдущего toInatSpatialRegion.
 */
export function toInatSpatialRegion(region) {
  if (!region) {
    return null;
  }

  if (region.inaturalist?.placeId != null) {
    return { id: region.id, ...region.inaturalist };
  }

  if (region.inaturalist?.bbox) {
    return { id: region.id, ...region.inaturalist };
  }

  if (region.placeId != null || region.bbox) {
    return region;
  }

  return null;
}
