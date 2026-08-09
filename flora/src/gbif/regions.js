/**
 * Реестр регионов для загрузки находок GBIF.
 * Новые регионы добавляются сюда: gadmGid (предпочтительно) или geometry/bbox.
 */

export const GBIF_REGIONS = [
  {
    id: "vologda",
    label: "Вологодская область",
    /** GADM level 1 — Vologda Oblast */
    gadmGid: "RUS.78_1"
  }
];

export const DEFAULT_GBIF_REGION_ID = "vologda";

/** Возвращает регион по id или null. */
export function getGbifRegionById(id) {
  return GBIF_REGIONS.find((region) => region.id === id) ?? null;
}

/** Регион по умолчанию (Вологодская область). */
export function getDefaultGbifRegion() {
  return getGbifRegionById(DEFAULT_GBIF_REGION_ID) ?? GBIF_REGIONS[0];
}
