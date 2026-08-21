import {
  firstLatinWord,
  matchScientificName,
  suggestFamilies,
  suggestGenera,
  suggestTaxa
} from "../gbif/speciesLookup";
import { GBIF_KINGDOMS, buildTaxonSearchExtras, mapKingdomNameToRegnum } from "../gbif/taxonFilters";
import { matchInatTaxon } from "../inaturalist/inatTaxaLookup";

export const TAXON_LOAD_MODES = {
  SPECIES: "species",
  GENUS: "genus",
  FAMILY: "family"
};

export function isNumericTaxonKey(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

function kingdomIdFromSuggestion(item) {
  if (item?.kingdomId) {
    return item.kingdomId;
  }
  const fromName = mapKingdomNameToRegnum(item?.kingdom);
  if (fromName && GBIF_KINGDOMS.some((kingdom) => kingdom.id === fromName)) {
    return fromName;
  }
  if (item?.kingdomKey != null) {
    const byKey = GBIF_KINGDOMS.find(
      (kingdom) => Number(kingdom.kingdomKey) === Number(item.kingdomKey)
    );
    return byKey?.id ?? null;
  }
  return null;
}

function toResolved(item, mode) {
  if (!item) {
    return null;
  }

  const taxonKey = isNumericTaxonKey(item.taxonKey) ? Number(item.taxonKey) : null;
  const familyKey = isNumericTaxonKey(item.familyKey) ? Number(item.familyKey) : null;
  const scientificName = item.scientificName || item.family || null;
  if (!scientificName || (taxonKey == null && familyKey == null)) {
    return null;
  }

  return {
    mode,
    scientificName,
    vernacularName: item.vernacularName || null,
    rank: item.rank || (mode === TAXON_LOAD_MODES.FAMILY ? "FAMILY" : null),
    taxonKey,
    familyKey: mode === TAXON_LOAD_MODES.FAMILY ? familyKey || taxonKey : familyKey,
    kingdom: item.kingdom || null,
    kingdomKey: item.kingdomKey ?? null,
    kingdomId: kingdomIdFromSuggestion(item),
    inatTaxonId: item.inatTaxonId ?? null
  };
}

function needsGbifMatch(suggestion) {
  return Boolean(
    suggestion?.needsMatch ||
      (suggestion?.taxonKey != null && String(suggestion.taxonKey).startsWith("local:"))
  );
}

/**
 * Резолвит выбранную подсказку / строку в GBIF taxonKey или familyKey.
 */
export async function resolveGbifLoadTaxon(
  { mode, suggestion = null, query = "", kingdomKey = null },
  { signal } = {}
) {
  const q = String(query ?? "").trim();

  if (mode === TAXON_LOAD_MODES.FAMILY) {
    if (suggestion?.familyKey || (suggestion?.rank === "FAMILY" && isNumericTaxonKey(suggestion.taxonKey))) {
      return toResolved(
        {
          ...suggestion,
          familyKey: suggestion.familyKey ?? suggestion.taxonKey,
          scientificName: suggestion.scientificName || suggestion.family
        },
        mode
      );
    }
    const families = await suggestFamilies(q, { kingdomKey, limit: 8, signal });
    const first = families[0];
    return first
      ? toResolved(
          {
            ...first,
            taxonKey: first.familyKey,
            rank: "FAMILY"
          },
          mode
        )
      : null;
  }

  if (mode === TAXON_LOAD_MODES.GENUS) {
    const genusName = firstLatinWord(suggestion?.scientificName || q);
    if (
      suggestion &&
      !needsGbifMatch(suggestion) &&
      String(suggestion.rank || "").toUpperCase() === "GENUS" &&
      isNumericTaxonKey(suggestion.taxonKey)
    ) {
      return toResolved({ ...suggestion, rank: "GENUS" }, mode);
    }

    const matched = genusName
      ? await matchScientificName(genusName, { kingdomKey, signal })
      : null;
    if (matched && String(matched.rank || "").toUpperCase() === "GENUS") {
      return toResolved(matched, mode);
    }

    const genera = await suggestGenera(genusName || q, { kingdomKey, limit: 8, signal });
    return genera[0] ? toResolved({ ...genera[0], rank: "GENUS" }, mode) : matched ? toResolved(matched, mode) : null;
  }

  if (suggestion && !needsGbifMatch(suggestion) && isNumericTaxonKey(suggestion.taxonKey)) {
    return toResolved(suggestion, mode);
  }

  const name = suggestion?.scientificName || q;
  const matched = await matchScientificName(name, { kingdomKey, signal });
  if (matched) {
    return toResolved(matched, mode);
  }

  const taxa = await suggestTaxa(name, { kingdomKey, limit: 8, signal });
  const numeric = taxa.find((item) => !needsGbifMatch(item) && isNumericTaxonKey(item.taxonKey));
  return numeric ? toResolved(numeric, mode) : null;
}

/**
 * Дописывает iNat taxon_id к уже резолвленному GBIF-таксону.
 */
export async function attachInatTaxonId(resolved, { signal } = {}) {
  if (!resolved?.scientificName) {
    return resolved;
  }

  const rank =
    resolved.mode === TAXON_LOAD_MODES.FAMILY
      ? "family"
      : resolved.mode === TAXON_LOAD_MODES.GENUS
        ? "genus"
        : resolved.rank
          ? String(resolved.rank).toLowerCase()
          : "species";

  try {
    const matched = await matchInatTaxon(resolved.scientificName, { rank, signal });
    if (!matched?.taxonId) {
      return resolved;
    }
    return { ...resolved, inatTaxonId: matched.taxonId };
  } catch {
    return resolved;
  }
}

export function buildGbifLoadExtras(resolved, kingdomId = null) {
  if (!resolved) {
    return buildTaxonSearchExtras({ kingdomId });
  }

  const kingdomFromTaxon = resolved.kingdomId || kingdomId;
  if (resolved.mode === TAXON_LOAD_MODES.FAMILY) {
    return buildTaxonSearchExtras({
      kingdomId: kingdomFromTaxon,
      family: { familyKey: resolved.familyKey ?? resolved.taxonKey }
    });
  }

  return buildTaxonSearchExtras({
    kingdomId: kingdomFromTaxon,
    taxon: { taxonKey: resolved.taxonKey }
  });
}

/** Только taxonKey/familyKey — царство добавляет превью по колонкам. */
export function buildGbifTaxonOnlyExtras(resolved) {
  if (!resolved) {
    return {};
  }
  if (resolved.mode === TAXON_LOAD_MODES.FAMILY) {
    const familyKey = resolved.familyKey ?? resolved.taxonKey;
    return isNumericTaxonKey(familyKey) ? { familyKey: Number(familyKey) } : {};
  }
  return isNumericTaxonKey(resolved.taxonKey) ? { taxonKey: Number(resolved.taxonKey) } : {};
}

export function buildInatLoadExtras(resolved, kingdomIds, iconicByKingdom) {
  if (resolved?.inatTaxonId != null) {
    return { taxon_id: resolved.inatTaxonId };
  }

  const selected = Array.isArray(kingdomIds) ? kingdomIds : [];
  if (selected.length === 0) {
    return {};
  }

  const iconic = selected.map((id) => iconicByKingdom[id]).filter(Boolean);
  if (iconic.length === 0) {
    return {};
  }

  return { iconicTaxa: iconic.length === 1 ? iconic[0] : iconic };
}

export function taxonQueryFields(resolved) {
  if (!resolved) {
    return {};
  }

  return {
    taxonMode: resolved.mode,
    taxonKey: resolved.taxonKey ?? null,
    familyKey: resolved.familyKey ?? null,
    scientificName: resolved.scientificName ?? null,
    inatTaxonId: resolved.inatTaxonId ?? null
  };
}

export function extrasFromLoadedQuery(query, source) {
  if (!query) {
    return null;
  }

  const resolved = {
    mode: query.taxonMode || null,
    taxonKey: query.taxonKey ?? null,
    familyKey: query.familyKey ?? null,
    scientificName: query.scientificName ?? null,
    inatTaxonId: query.inatTaxonId ?? null,
    kingdomId: query.kingdomId ?? null
  };

  const hasTaxon =
    resolved.taxonKey != null || resolved.familyKey != null || resolved.inatTaxonId != null;
  if (!hasTaxon) {
    return null;
  }

  if (source === "inat") {
    return resolved.inatTaxonId != null ? { taxon_id: resolved.inatTaxonId } : null;
  }

  return buildGbifLoadExtras(resolved, resolved.kingdomId);
}
