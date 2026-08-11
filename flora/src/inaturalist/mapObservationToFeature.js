import { isRussianVernacular } from "../names/vernacularUtils";

const ICONIC_TO_REGNUM = {
  Plantae: "plantae",
  Fungi: "fungi"
};

const ANIMALIA_ICONIC = new Set([
  "Animalia",
  "Mollusca",
  "Reptilia",
  "Aves",
  "Amphibia",
  "Actinopterygii",
  "Mammalia",
  "Insecta",
  "Arachnida"
]);

function mapIconicTaxonToRegnum(iconicTaxonName) {
  if (!iconicTaxonName) {
    return null;
  }

  if (ICONIC_TO_REGNUM[iconicTaxonName]) {
    return ICONIC_TO_REGNUM[iconicTaxonName];
  }

  if (ANIMALIA_ICONIC.has(iconicTaxonName)) {
    return "animalia";
  }

  return null;
}

function getTaxonAncestors(observation) {
  const taxon = observation?.taxon;
  if (Array.isArray(taxon?.ancestors) && taxon.ancestors.length > 0) {
    return taxon.ancestors;
  }

  const identification = observation?.identifications?.find(
    (item) => Array.isArray(item?.taxon?.ancestors) && item.taxon.ancestors.length > 0
  );

  return identification?.taxon?.ancestors ?? [];
}

function getAncestorName(ancestors, rank) {
  const match = ancestors.find((item) => item?.rank === rank);
  return match?.name ?? null;
}

function resolveObservationNameRu(observation) {
  const speciesGuess = observation?.species_guess;
  if (speciesGuess && isRussianVernacular(speciesGuess)) {
    return speciesGuess;
  }

  const ancestors = getTaxonAncestors(observation);
  for (const ancestor of ancestors) {
    const commonName = ancestor?.preferred_common_name;
    if (commonName && isRussianVernacular(commonName)) {
      return commonName;
    }
  }

  const taxonCommon = observation?.taxon?.preferred_common_name;
  if (taxonCommon && isRussianVernacular(taxonCommon)) {
    return taxonCommon;
  }

  return null;
}

function resolveCommunityTaxon(observation) {
  return observation?.taxon ?? null;
}

/**
 * Преобразует наблюдение iNaturalist в GeoJSON Feature.
 * Пропускает записи без валидных координат или id.
 */
export function mapObservationToFeature(observation) {
  const coordinates = observation?.geojson?.coordinates;
  const lng = coordinates?.[0];
  const lat = coordinates?.[1];

  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    Number.isNaN(lng) ||
    Number.isNaN(lat)
  ) {
    return null;
  }

  const id = observation?.id;
  if (id == null) {
    return null;
  }

  const taxon = resolveCommunityTaxon(observation);
  const ancestors = getTaxonAncestors(observation);
  const iconicTaxonName = taxon?.iconic_taxon_name ?? observation?.iconic_taxon_name ?? null;
  const kingdom =
    getAncestorName(ancestors, "kingdom") ??
    (iconicTaxonName === "Plantae"
      ? "Plantae"
      : iconicTaxonName === "Fungi"
        ? "Fungi"
        : iconicTaxonName
          ? "Animalia"
          : null);

  return {
    type: "Feature",
    id: `inat-${id}`,
    geometry: {
      type: "Point",
      coordinates: [lng, lat]
    },
    properties: {
      source: "inaturalist",
      inat_id: id,
      name_latin: taxon?.name ?? null,
      name_ru: resolveObservationNameRu(observation),
      taxon_id: observation?.community_taxon_id ?? taxon?.id ?? null,
      regnum: mapIconicTaxonToRegnum(iconicTaxonName),
      kingdom,
      family: getAncestorName(ancestors, "family"),
      found_year: observation?.observed_on_details?.year ?? null,
      found_by: observation?.user?.login ?? observation?.user?.name ?? null,
      quality_grade: observation?.quality_grade ?? null,
      place_guess: observation?.place_guess ?? null,
      license_code: observation?.license_code ?? null,
      obscured: Boolean(observation?.obscured),
      inat_url: observation?.uri ?? `https://www.inaturalist.org/observations/${id}`
    }
  };
}

/** Маппит массив observations → массив Feature (без null). */
export function mapObservationsToFeatures(observations) {
  if (!Array.isArray(observations)) {
    return [];
  }

  return observations.map(mapObservationToFeature).filter((feature) => feature != null);
}
