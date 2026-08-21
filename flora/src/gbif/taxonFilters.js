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
  },
  {
    id: "protozoa",
    label: "Простейшие",
    kingdomKey: 7,
    kingdomName: "Protozoa"
  }
];

export function getGbifKingdomById(id) {
  return GBIF_KINGDOMS.find((item) => item.id === id) ?? null;
}

/** Латинское имя царства GBIF/iNat → id regnum проекта (plantae, …). */
export function mapKingdomNameToRegnum(kingdomName) {
  if (!kingdomName) {
    return null;
  }

  const raw = String(kingdomName).trim();
  if (!raw) {
    return null;
  }

  const byName = GBIF_KINGDOMS.find((item) => item.kingdomName === raw);
  if (byName) {
    return byName.id;
  }

  const lower = raw.toLowerCase();
  const byId = GBIF_KINGDOMS.find((item) => item.id === lower);
  if (byId) {
    return byId.id;
  }

  return lower;
}

/**
 * Единое царство точки: regnum, иначе kingdom (для старых снимков GBIF/iNat).
 */
export function resolveFeatureRegnum(properties = {}) {
  if (properties.regnum) {
    return mapKingdomNameToRegnum(properties.regnum);
  }

  if (properties.kingdom) {
    return mapKingdomNameToRegnum(properties.kingdom);
  }

  return null;
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

  const taxonKey = taxon?.taxonKey;
  if (taxonKey != null && Number.isFinite(Number(taxonKey))) {
    extras.taxonKey = Number(taxonKey);
  } else if (family?.familyKey != null && Number.isFinite(Number(family.familyKey))) {
    extras.familyKey = Number(family.familyKey);
  }

  return extras;
}
