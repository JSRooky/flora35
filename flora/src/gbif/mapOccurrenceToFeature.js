import { isRussianVernacular } from "../names/vernacularUtils";
import { mapKingdomNameToRegnum } from "./taxonFilters";
import {
  parseFoundMonthFromDateString,
  parseFoundMonthFromParts
} from "../geo/foundDate";

function resolveOccurrenceNameRu(occurrence) {
  const vernacularName = occurrence?.vernacularName;
  if (!vernacularName) {
    return null;
  }

  return isRussianVernacular(vernacularName, occurrence?.language) ? vernacularName : null;
}

function resolveOccurrenceFoundMonth(occurrence) {
  const fromParts = parseFoundMonthFromParts({
    year: occurrence?.year,
    month: occurrence?.month,
    day: occurrence?.day
  });
  if (fromParts != null) {
    return fromParts;
  }

  return parseFoundMonthFromDateString(occurrence?.eventDate);
}

/**
 * Преобразует запись occurrence GBIF в GeoJSON Feature.
 * Пропускает записи без валидных координат.
 */
export function mapOccurrenceToFeature(occurrence) {
  const lng = occurrence?.decimalLongitude;
  const lat = occurrence?.decimalLatitude;

  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    Number.isNaN(lng) ||
    Number.isNaN(lat)
  ) {
    return null;
  }

  const key = occurrence.key ?? occurrence.gbifID;
  if (key == null) {
    return null;
  }

  const nameLatin =
    occurrence.species || occurrence.scientificName || occurrence.acceptedScientificName || null;
  const speciesKey =
    occurrence.speciesKey ?? occurrence.acceptedTaxonKey ?? occurrence.taxonKey ?? null;

  return {
    type: "Feature",
    id: `gbif-${key}`,
    geometry: {
      type: "Point",
      coordinates: [lng, lat]
    },
    properties: {
      source: "gbif",
      gbif_key: key,
      name_latin: nameLatin,
      name_ru: resolveOccurrenceNameRu(occurrence),
      species_key: speciesKey,
      regnum: mapKingdomNameToRegnum(occurrence.kingdom),
      family: occurrence.family ?? null,
      found_year: occurrence.year ?? null,
      found_month: resolveOccurrenceFoundMonth(occurrence),
      found_by: occurrence.recordedBy ?? null,
      identified_by: occurrence.identifiedBy ?? null,
      datasetKey: occurrence.datasetKey ?? null,
      basisOfRecord: occurrence.basisOfRecord ?? null,
      gbif_url: `https://www.gbif.org/occurrence/${key}`
    }
  };
}

/** Маппит массив occurrence → массив Feature (без null). */
export function mapOccurrencesToFeatures(occurrences) {
  if (!Array.isArray(occurrences)) {
    return [];
  }

  return occurrences
    .map(mapOccurrenceToFeature)
    .filter((feature) => feature != null);
}
