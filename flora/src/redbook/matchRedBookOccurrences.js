import { normalizeLatinName } from "../dataWork/normalizeLatinName";
import { getGbifColumnarTable, getGbifFeaturesByIndices } from "../gbif/gbifStore";
import { readGbifNameLatin } from "../gbif/gbifColumnar";
import { getInatColumnarTable, getInatFeaturesByIndices } from "../inaturalist/inatStore";
import { readInatNameLatin } from "../inaturalist/inatColumnar";
import { RED_BOOK_STATUS_NONE } from "./constants";

/**
 * @param {object} feature
 * @param {"gbif"|"inaturalist"} originSource
 * @param {string} status
 * @returns {object|null}
 */
function toRedBookMatchFeature(feature, originSource, status) {
  if (!feature?.geometry?.coordinates) {
    return null;
  }

  const props = feature.properties ?? {};
  const originId =
    originSource === "gbif"
      ? props.gbif_key ?? feature.id
      : props.inat_id ?? feature.id;

  if (originId == null || originId === "") {
    return null;
  }

  const matchId = `rb-${originSource === "gbif" ? "gbif" : "inat"}-${originId}`;

  return {
    type: "Feature",
    id: matchId,
    geometry: feature.geometry,
    properties: {
      ...props,
      source: "redbook",
      origin_source: originSource,
      status: status || RED_BOOK_STATUS_NONE,
      redbook_match_id: matchId
    }
  };
}

/**
 * Ищет среди загруженных GBIF/iNat точки видов из списка Красной книги.
 * @param {{ species?: Array<{ name_latin: string, name_latin_norm?: string, status?: string }> }} list
 * @returns {{
 *   collection: GeoJSON.FeatureCollection,
 *   stats: {
 *     listCount: number,
 *     matchedSpeciesCount: number,
 *     unmatchedSpeciesCount: number,
 *     pointCount: number,
 *     gbifPointCount: number,
 *     inatPointCount: number,
 *     unmatchedSpecies: Array<{ name_latin: string, status: string }>,
 *     speciesCounts: Array<{
 *       name_latin: string,
 *       name_latin_norm: string,
 *       status: string,
 *       gbifCount: number,
 *       inatCount: number,
 *       pointCount: number
 *     }>
 *   }
 * }}
 */
export function matchRedBookOccurrences(list) {
  const species = Array.isArray(list?.species) ? list.species : [];
  const statusByNorm = new Map();

  for (const entry of species) {
    const norm =
      entry.name_latin_norm || normalizeLatinName(entry.name_latin);
    if (!norm || statusByNorm.has(norm)) {
      continue;
    }
    statusByNorm.set(norm, {
      name_latin: entry.name_latin,
      status: entry.status || RED_BOOK_STATUS_NONE
    });
  }

  const matchedNorms = new Set();
  const byMatchId = new Map();
  /** @type {Map<string, { gbif: number, inat: number }>} */
  const countsByNorm = new Map();

  const bumpCount = (norm, originSource) => {
    const current = countsByNorm.get(norm) ?? { gbif: 0, inat: 0 };
    if (originSource === "gbif") {
      current.gbif += 1;
    } else {
      current.inat += 1;
    }
    countsByNorm.set(norm, current);
  };

  const scan = (features, originSource) => {
    for (const feature of features ?? []) {
      const norm = normalizeLatinName(feature?.properties?.name_latin);
      if (!norm || !statusByNorm.has(norm)) {
        continue;
      }

      const meta = statusByNorm.get(norm);
      const matchFeature = toRedBookMatchFeature(
        feature,
        originSource,
        meta.status
      );
      if (!matchFeature) {
        continue;
      }

      const isNew = !byMatchId.has(matchFeature.id);
      matchedNorms.add(norm);
      byMatchId.set(matchFeature.id, matchFeature);
      if (isNew) {
        bumpCount(norm, originSource);
      }
    }
  };

  const scanTable = (table, readNameLatin, getFeaturesByIndices, originSource) => {
    const rowCount = table?.rowCount ?? 0;
    const matchedIndices = [];

    for (let i = 0; i < rowCount; i += 1) {
      const norm = normalizeLatinName(readNameLatin(table, i));
      if (norm && statusByNorm.has(norm)) {
        matchedIndices.push(i);
      }
    }

    const features = getFeaturesByIndices(matchedIndices);
    scan(features, originSource);
  };

  scanTable(getGbifColumnarTable(), readGbifNameLatin, getGbifFeaturesByIndices, "gbif");
  scanTable(
    getInatColumnarTable(),
    readInatNameLatin,
    getInatFeaturesByIndices,
    "inaturalist"
  );

  let gbifPointCount = 0;
  let inatPointCount = 0;
  for (const feature of byMatchId.values()) {
    if (feature.properties?.origin_source === "gbif") {
      gbifPointCount += 1;
    } else {
      inatPointCount += 1;
    }
  }

  const unmatchedSpecies = [];
  const speciesCounts = [];
  for (const [norm, meta] of statusByNorm.entries()) {
    const counts = countsByNorm.get(norm) ?? { gbif: 0, inat: 0 };
    const pointCount = counts.gbif + counts.inat;
    speciesCounts.push({
      name_latin: meta.name_latin,
      name_latin_norm: norm,
      status: meta.status,
      gbifCount: counts.gbif,
      inatCount: counts.inat,
      pointCount
    });

    if (!matchedNorms.has(norm)) {
      unmatchedSpecies.push({
        name_latin: meta.name_latin,
        status: meta.status
      });
    }
  }

  speciesCounts.sort((a, b) => a.name_latin.localeCompare(b.name_latin, "en"));
  unmatchedSpecies.sort((a, b) =>
    a.name_latin.localeCompare(b.name_latin, "en")
  );

  return {
    collection: {
      type: "FeatureCollection",
      features: Array.from(byMatchId.values())
    },
    stats: {
      listCount: statusByNorm.size,
      matchedSpeciesCount: matchedNorms.size,
      unmatchedSpeciesCount: unmatchedSpecies.length,
      pointCount: byMatchId.size,
      gbifPointCount,
      inatPointCount,
      unmatchedSpecies,
      speciesCounts
    }
  };
}

/**
 * Точки совпадений одного вида по нормализованной латыни.
 * @param {GeoJSON.FeatureCollection|null|undefined} collection
 * @param {string} nameLatinNorm
 * @returns {object[]}
 */
export function filterMatchFeaturesByLatinNorm(collection, nameLatinNorm) {
  const norm = typeof nameLatinNorm === "string" ? nameLatinNorm : "";
  if (!norm) {
    return [];
  }

  return (collection?.features ?? []).filter(
    (feature) => normalizeLatinName(feature?.properties?.name_latin) === norm
  );
}

/**
 * Нормализованные латыни видов, которые уже есть на слое совпадений.
 * @param {GeoJSON.FeatureCollection|object[]|null|undefined} collectionOrFeatures
 * @returns {Set<string>}
 */
export function collectLatinNormsFromMatches(collectionOrFeatures) {
  const features = Array.isArray(collectionOrFeatures)
    ? collectionOrFeatures
    : collectionOrFeatures?.features ?? [];
  const norms = new Set();

  for (const feature of features) {
    const norm = normalizeLatinName(feature?.properties?.name_latin);
    if (norm) {
      norms.add(norm);
    }
  }

  return norms;
}
