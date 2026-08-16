import { normalizeLatinName } from "../dataWork/normalizeLatinName";
import { getGbifColumnarTable, getGbifFeaturesByIndices } from "../gbif/gbifStore";
import { readGbifNameLatin } from "../gbif/gbifColumnar";
import { getInatColumnarTable, getInatFeaturesByIndices } from "../inaturalist/inatStore";
import { readInatNameLatin } from "../inaturalist/inatColumnar";
import { getTempLayers, getTempLayerStaging } from "../tempLayers/tempLayerStore";
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
  let originId =
    originSource === "gbif"
      ? props.gbif_key ?? feature.id
      : props.inat_id ?? feature.id;

  if (originId == null || originId === "") {
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return null;
    }
    originId = `${coords[0]},${coords[1]}`;
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

function originSourceFromTempItem(feature, layerSource) {
  const props = feature?.properties ?? {};
  const raw = String(
    layerSource || props.temp_source || props.source || ""
  ).toLowerCase();
  if (raw === "inat" || raw === "inaturalist") {
    return "inaturalist";
  }
  if (props.inat_id != null && props.inat_id !== "") {
    return "inaturalist";
  }
  return "gbif";
}

function latinMatchKeys(value) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const norm = normalizeLatinName(raw);
  if (!norm) {
    return [];
  }

  const keys = [norm];
  const words = norm.split(" ");
  if (words.length >= 2) {
    const binomial = `${words[0]} ${words[1]}`;
    if (binomial !== norm) {
      keys.push(binomial);
    }
  }
  return keys;
}

function collectTempScanItems() {
  const items = [];
  const staging = getTempLayerStaging();
  for (const feature of staging?.features ?? []) {
    items.push({
      feature,
      taxonName: staging.taxonName,
      source: staging.source
    });
  }
  for (const layer of getTempLayers() ?? []) {
    for (const feature of layer?.features ?? []) {
      items.push({
        feature,
        taxonName: layer.taxonName,
        source: layer.source
      });
    }
  }
  return items;
}

/**
 * Ищет среди загруженных GBIF/iNat и временных слоёв точки видов из списка Красной книги.
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
 *     tempPointCount: number,
 *     foundSources: string[],
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
  /** @type {Map<string, { name_latin: string, status: string }>} */
  const statusByPrimary = new Map();
  /** @type {Map<string, string>} alias -> primary norm */
  const lookupToPrimary = new Map();

  for (const entry of species) {
    const primary =
      entry.name_latin_norm || normalizeLatinName(entry.name_latin);
    if (!primary || statusByPrimary.has(primary)) {
      continue;
    }
    const meta = {
      name_latin: entry.name_latin,
      status: entry.status || RED_BOOK_STATUS_NONE
    };
    statusByPrimary.set(primary, meta);
    for (const key of latinMatchKeys(primary)) {
      if (!lookupToPrimary.has(key)) {
        lookupToPrimary.set(key, primary);
      }
    }
  }

  const resolvePrimary = (rawName) => {
    for (const key of latinMatchKeys(rawName)) {
      const primary = lookupToPrimary.get(key);
      if (primary) {
        return primary;
      }
    }
    return null;
  };

  const resolveFeaturePrimary = (feature, layerTaxonName) => {
    const props = feature?.properties ?? {};
    const candidates = [
      props.name_latin,
      props.scientificName,
      props.acceptedScientificName,
      props.species,
      props.taxonName,
      layerTaxonName
    ];
    for (const candidate of candidates) {
      const primary = resolvePrimary(candidate);
      if (primary) {
        return primary;
      }
    }
    return null;
  };

  const matchedNorms = new Set();
  const byMatchId = new Map();
  /** @type {Map<string, { gbif: number, inat: number }>} */
  const countsByNorm = new Map();
  const sourcePointCount = { gbif: 0, inat: 0, temp: 0 };

  const bumpCount = (norm, originSource) => {
    const current = countsByNorm.get(norm) ?? { gbif: 0, inat: 0 };
    if (originSource === "gbif") {
      current.gbif += 1;
    } else {
      current.inat += 1;
    }
    countsByNorm.set(norm, current);
  };

  const acceptFeature = (feature, originSource, sourceKey, layerTaxonName) => {
    const primary = resolveFeaturePrimary(feature, layerTaxonName);
    if (!primary) {
      return;
    }
    const meta = statusByPrimary.get(primary);
    const matchFeature = toRedBookMatchFeature(
      feature,
      originSource,
      meta.status
    );
    if (!matchFeature) {
      return;
    }
    if (!matchFeature.properties.name_latin && layerTaxonName) {
      matchFeature.properties.name_latin = layerTaxonName;
    }

    const isNew = !byMatchId.has(matchFeature.id);
    matchedNorms.add(primary);
    byMatchId.set(matchFeature.id, matchFeature);
    if (isNew) {
      bumpCount(primary, originSource);
      sourcePointCount[sourceKey] += 1;
    }
  };

  const scan = (features, originSource, sourceKey) => {
    for (const feature of features ?? []) {
      acceptFeature(feature, originSource, sourceKey, null);
    }
  };

  const scanTable = (table, readNameLatin, getFeaturesByIndices, originSource) => {
    const rowCount = table?.rowCount ?? 0;
    const matchedIndices = [];

    for (let i = 0; i < rowCount; i += 1) {
      if (resolvePrimary(readNameLatin(table, i))) {
        matchedIndices.push(i);
      }
    }

    const features = getFeaturesByIndices(matchedIndices);
    scan(features, originSource, originSource === "gbif" ? "gbif" : "inat");
  };

  scanTable(getGbifColumnarTable(), readGbifNameLatin, getGbifFeaturesByIndices, "gbif");
  scanTable(
    getInatColumnarTable(),
    readInatNameLatin,
    getInatFeaturesByIndices,
    "inaturalist"
  );

  for (const item of collectTempScanItems()) {
    acceptFeature(
      item.feature,
      originSourceFromTempItem(item.feature, item.source),
      "temp",
      item.taxonName
    );
  }

  const unmatchedSpecies = [];
  const speciesCounts = [];
  for (const [norm, meta] of statusByPrimary.entries()) {
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

  const foundSources = [];
  if (sourcePointCount.gbif > 0) {
    foundSources.push("GBIF");
  }
  if (sourcePointCount.inat > 0) {
    foundSources.push("iNaturalist");
  }
  if (sourcePointCount.temp > 0) {
    foundSources.push("временные слои");
  }

  return {
    collection: {
      type: "FeatureCollection",
      features: Array.from(byMatchId.values())
    },
    stats: {
      listCount: statusByPrimary.size,
      matchedSpeciesCount: matchedNorms.size,
      unmatchedSpeciesCount: unmatchedSpecies.length,
      pointCount: byMatchId.size,
      gbifPointCount: sourcePointCount.gbif,
      inatPointCount: sourcePointCount.inat,
      tempPointCount: sourcePointCount.temp,
      foundSources,
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
  const wanted = new Set(latinMatchKeys(nameLatinNorm));
  if (wanted.size === 0) {
    return [];
  }

  return (collection?.features ?? []).filter((feature) => {
    const props = feature?.properties ?? {};
    const candidates = [
      props.name_latin,
      props.scientificName,
      props.acceptedScientificName,
      props.species,
      props.taxonName
    ];
    return candidates.some((candidate) =>
      latinMatchKeys(candidate).some((key) => wanted.has(key))
    );
  });
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
