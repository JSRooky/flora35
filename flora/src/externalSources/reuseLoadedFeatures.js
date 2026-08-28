import { resolveFeatureRegnum } from "../gbif/taxonFilters";
import { getGbifFeaturesForRegionIds, getGbifLoadedRegionIds } from "../gbif/gbifStore";
import { getInatFeaturesForRegionIds, getInatLoadedRegionIds } from "../inaturalist/inatStore";
import {
  collectTempLayerFeaturesForRegion,
  TEMP_SOURCE_IDS
} from "../tempLayers/tempLayerStore";

export function regionHasSpatialOverride(region) {
  return Boolean(
    region?.gbif?.geometry ||
      region?.gbif?.bbox ||
      region?.inaturalist?.bbox ||
      region?.inaturalist?.geometry
  );
}

export function extrasLookIncremental(extras = {}) {
  return Boolean(extras.lastInterpreted || extras.updated_since);
}

export function requestedKingdomIds(kingdomId, query = {}) {
  if (kingdomId) {
    return [String(kingdomId)];
  }
  if (Array.isArray(query.kingdomIds) && query.kingdomIds.length > 0) {
    return query.kingdomIds.map(String);
  }
  if (query.kingdomId) {
    return [String(query.kingdomId)];
  }
  return [];
}

export function kingdomsCoveredByFeatures(features) {
  const covered = new Set();
  (features ?? []).forEach((feature) => {
    const id = resolveFeatureRegnum(feature?.properties ?? {});
    if (id) {
      covered.add(id);
    }
  });
  return covered;
}

export function canReuseCoverage(covered, requestedIds, { regionLoaded = false } = {}) {
  const requested =
    Array.isArray(requestedIds) && requestedIds.length > 0 ? requestedIds : null;
  if (!requested) {
    return Boolean(regionLoaded || covered.size > 0);
  }
  return requested.every((id) => covered.has(id));
}

function matchesTaxon(feature, taxon) {
  if (!taxon) {
    return true;
  }
  const props = feature?.properties ?? {};
  const taxonKeys = Array.isArray(taxon.taxonKeys)
    ? taxon.taxonKeys.map(String)
    : [];
  if (taxon.taxonKey != null && taxon.taxonKey !== "") {
    taxonKeys.push(String(taxon.taxonKey));
  }
  if (taxon.familyKey != null && taxon.familyKey !== "") {
    taxonKeys.push(String(taxon.familyKey));
  }

  const speciesKey = props.species_key ?? props.taxonKey ?? props.speciesKey;
  if (taxonKeys.length && speciesKey != null && taxonKeys.includes(String(speciesKey))) {
    return true;
  }
  if (
    taxon.familyKey != null &&
    String(props.family_key ?? props.familyKey ?? "") === String(taxon.familyKey)
  ) {
    return true;
  }
  if (taxon.inatTaxonId != null) {
    const inatId = props.taxon_id ?? props.inat_taxon_id ?? props.taxonId;
    if (inatId != null && String(inatId) === String(taxon.inatTaxonId)) {
      return true;
    }
  }

  const name = String(taxon.scientificName || "").trim().toLowerCase();
  if (name) {
    const latin = String(props.name_latin || "").trim().toLowerCase();
    if (latin === name || latin.startsWith(`${name} `)) {
      return true;
    }
  }

  return !(taxonKeys.length || taxon.inatTaxonId || name);
}

export function filterReusableFeatures(features, { kingdomIds = [], taxon = null } = {}) {
  const requested = Array.isArray(kingdomIds) ? kingdomIds.filter(Boolean) : [];
  return (features ?? []).filter((feature) => {
    if (requested.length) {
      const regnum = resolveFeatureRegnum(feature?.properties ?? {});
      if (!regnum || !requested.includes(regnum)) {
        return false;
      }
    }
    return matchesTaxon(feature, taxon);
  });
}

function collectLocalFeatures(source, regionId) {
  const fromTemp = collectTempLayerFeaturesForRegion(source, regionId);
  if (fromTemp.length > 0) {
    return fromTemp;
  }
  return source === TEMP_SOURCE_IDS.INAT
    ? getInatFeaturesForRegionIds([regionId])
    : getGbifFeaturesForRegionIds([regionId]);
}

function regionIsLoaded(source, regionId) {
  const ids =
    source === TEMP_SOURCE_IDS.INAT ? getInatLoadedRegionIds() : getGbifLoadedRegionIds();
  return ids.has(regionId);
}

/**
 * Если регион уже лежит в слое GBIF/iNat или во временном слое —
 * копируем точки локально вместо повторного запроса к API.
 */
export function resolveReusableExternalLoad({
  source,
  region,
  kingdomId = "",
  query = {},
  extras = {},
  taxon = null
} = {}) {
  const regionId = region?.id;
  if (!regionId || regionHasSpatialOverride(region) || extrasLookIncremental(extras)) {
    return { mode: "fetch", features: [] };
  }

  const src = source === "inat" || source === TEMP_SOURCE_IDS.INAT ? TEMP_SOURCE_IDS.INAT : TEMP_SOURCE_IDS.GBIF;
  const raw = collectLocalFeatures(src, regionId);
  const requested = requestedKingdomIds(kingdomId, query);
  const loaded = regionIsLoaded(src, regionId) || raw.length > 0;

  if (!loaded) {
    return { mode: "fetch", features: [] };
  }

  if (taxon) {
    return {
      mode: "reuse",
      features: filterReusableFeatures(raw, { kingdomIds: requested, taxon })
    };
  }

  const covered = kingdomsCoveredByFeatures(raw);
  if (!canReuseCoverage(covered, requested, { regionLoaded: loaded })) {
    return { mode: "fetch", features: [] };
  }

  return {
    mode: "reuse",
    features: filterReusableFeatures(raw, { kingdomIds: requested, taxon })
  };
}
