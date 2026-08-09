/** Царства GBIF, совпадающие с regnum проекта. */
export const GBIF_KINGDOMS = [
  {
    id: "plantae",
    label: "Растения",
    kingdomKey: 6,
    kingdomName: "Plantae"
  },
  {
    id: "animalia",
    label: "Животные",
    kingdomKey: 1,
    kingdomName: "Animalia"
  },
  {
    id: "fungi",
    label: "Грибы",
    kingdomKey: 5,
    kingdomName: "Fungi"
  }
];

export function getGbifKingdomById(id) {
  return GBIF_KINGDOMS.find((item) => item.id === id) ?? null;
}

/**
 * Собирает extras для occurrence/search из выбранных фильтров.
 * Приоритет сужения: taxonKey → familyKey; kingdomKey всегда, если выбран.
 */
export function buildTaxonSearchExtras({
  kingdomId = null,
  family = null,
  taxon = null
} = {}) {
  const extras = {};
  const kingdom = getGbifKingdomById(kingdomId);

  if (kingdom?.kingdomKey != null) {
    extras.kingdomKey = kingdom.kingdomKey;
  }

  if (taxon?.taxonKey != null) {
    extras.taxonKey = taxon.taxonKey;
  } else if (family?.familyKey != null) {
    extras.familyKey = family.familyKey;
  }

  return extras;
}
