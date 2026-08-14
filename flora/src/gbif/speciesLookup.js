import { getAllSpeciesCollection } from "../locations/loadPoints";
import { getGbifKingdomById } from "./taxonFilters";
import { pickRussianVernacular } from "../names/vernacularUtils";

const SPECIES_SUGGEST_URL = "https://api.gbif.org/v1/species/suggest";
const SPECIES_SEARCH_URL = "https://api.gbif.org/v1/species/search";
const SPECIES_MATCH_URL = "https://api.gbif.org/v1/species/match";

const RANK_PRIORITY = {
  SPECIES: 0,
  SUBSPECIES: 1,
  VARIETY: 2,
  FORM: 3,
  GENUS: 4,
  FAMILY: 5,
  ORDER: 6,
  CLASS: 7,
  PHYLUM: 8,
  KINGDOM: 9
};

const KINGDOM_KEY_TO_NAME = {
  1: "Animalia",
  5: "Fungi",
  6: "Plantae",
  7: "Protozoa"
};

function normalizeQuery(query) {
  return String(query ?? "").trim();
}

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`GBIF Species API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function toSuggestion(raw, source) {
  const taxonKey = raw.nubKey ?? raw.key ?? raw.speciesKey ?? raw.usageKey;
  if (taxonKey == null || taxonKey === 0) {
    return null;
  }

  const scientificName = raw.canonicalName || raw.scientificName || raw.name || null;
  if (!scientificName) {
    return null;
  }

  const vernacularName =
    raw.vernacularName || pickRussianVernacular(raw.vernacularNames) || null;

  return {
    taxonKey,
    scientificName,
    vernacularName,
    rank: raw.rank ?? null,
    status: raw.status ?? (raw.synonym ? "SYNONYM" : null),
    kingdom: raw.kingdom ?? null,
    kingdomKey: raw.kingdomKey ?? null,
    family: raw.family ?? null,
    familyKey: raw.familyKey ?? null,
    source,
    needsMatch: false
  };
}

function dedupeSuggestions(items) {
  const byKey = new Map();

  items.forEach((item) => {
    if (!item) {
      return;
    }

    const existing = byKey.get(item.taxonKey);
    if (!existing) {
      byKey.set(item.taxonKey, item);
      return;
    }

    const existingRank = RANK_PRIORITY[existing.rank] ?? 100;
    const nextRank = RANK_PRIORITY[item.rank] ?? 100;
    if (nextRank < existingRank) {
      byKey.set(item.taxonKey, { ...existing, ...item });
    } else if (!existing.vernacularName && item.vernacularName) {
      byKey.set(item.taxonKey, { ...existing, vernacularName: item.vernacularName });
    }
  });

  return [...byKey.values()].sort((left, right) => {
    const leftLocal = left.source === "local" ? 0 : 1;
    const rightLocal = right.source === "local" ? 0 : 1;
    if (leftLocal !== rightLocal) {
      return leftLocal - rightLocal;
    }

    const rankDiff = (RANK_PRIORITY[left.rank] ?? 100) - (RANK_PRIORITY[right.rank] ?? 100);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.scientificName.localeCompare(right.scientificName, "en");
  });
}

function matchesKingdom(item, kingdomKey) {
  if (kingdomKey == null) {
    return true;
  }
  if (item.kingdomKey != null) {
    return Number(item.kingdomKey) === Number(kingdomKey);
  }
  return true;
}

/**
 * Локальные виды из points/userpoints — удобны для русских названий.
 * taxonKey временный; перед загрузкой резолвится через /species/match.
 */
function suggestLocalSpecies(query, { kingdomId = null, limit = 8 } = {}) {
  const q = normalizeQuery(query).toLowerCase();
  if (q.length < 2) {
    return [];
  }

  const kingdom = getGbifKingdomById(kingdomId);
  const collection = getAllSpeciesCollection();
  const matches = [];

  for (const species of collection.species ?? []) {
    if (kingdom && species.regnum && species.regnum !== kingdom.id) {
      continue;
    }

    const nameRu = String(species.name_ru ?? "");
    const nameLatin = String(species.name_latin ?? "");
    const haystack = `${nameRu} ${nameLatin}`.toLowerCase();

    if (!haystack.includes(q)) {
      continue;
    }

    matches.push({
      taxonKey: `local:${species.id}`,
      scientificName: nameLatin,
      vernacularName: nameRu || null,
      rank: "SPECIES",
      status: "LOCAL",
      kingdom: kingdom?.kingdomName ?? null,
      kingdomKey: kingdom?.kingdomKey ?? null,
      family: species.family ?? null,
      familyKey: null,
      source: "local",
      needsMatch: true
    });

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

/** Резолвит латинское имя в GBIF taxonKey через /species/match. */
export async function matchScientificName(name, { kingdomKey = null, signal } = {}) {
  const q = normalizeQuery(name);
  if (!q) {
    return null;
  }

  const params = new URLSearchParams({ name: q });
  const kingdomName = KINGDOM_KEY_TO_NAME[Number(kingdomKey)];
  if (kingdomName) {
    params.set("kingdom", kingdomName);
  }

  const payload = await fetchJson(`${SPECIES_MATCH_URL}?${params.toString()}`, { signal });

  if (!payload?.usageKey || payload.matchType === "NONE") {
    return null;
  }

  return toSuggestion(
    {
      ...payload,
      key: payload.usageKey,
      nubKey: payload.usageKey,
      canonicalName: payload.canonicalName,
      scientificName: payload.scientificName
    },
    "match"
  );
}

/**
 * Подсказки таксонов по латыни и русскому
 * (локальный каталог + species/suggest + species/search).
 */
export async function suggestTaxa(
  query,
  { kingdomKey = null, kingdomId = null, limit = 8, signal } = {}
) {
  const q = normalizeQuery(query);
  if (q.length < 2) {
    return [];
  }

  const local = suggestLocalSpecies(q, { kingdomId, limit });

  const encoded = encodeURIComponent(q);
  const suggestUrl = `${SPECIES_SUGGEST_URL}?q=${encoded}&limit=${limit}`;
  const searchUrl = `${SPECIES_SEARCH_URL}?q=${encoded}&limit=${limit}`;

  const [suggestPayload, searchPayload] = await Promise.all([
    fetchJson(suggestUrl, { signal }),
    fetchJson(searchUrl, { signal })
  ]);

  const suggestItems = (Array.isArray(suggestPayload) ? suggestPayload : []).map((item) =>
    toSuggestion(item, "suggest")
  );
  const searchItems = (searchPayload?.results ?? []).map((item) => toSuggestion(item, "search"));

  return dedupeSuggestions([...local, ...suggestItems, ...searchItems])
    .filter((item) => matchesKingdom(item, kingdomKey))
    .slice(0, limit);
}

/**
 * Подсказки семейств (rank=FAMILY), с фильтром по царству при наличии.
 */
export async function suggestFamilies(query, { kingdomKey = null, limit = 8, signal } = {}) {
  const q = normalizeQuery(query);
  if (q.length < 2) {
    return [];
  }

  const encoded = encodeURIComponent(q);
  const url = `${SPECIES_SUGGEST_URL}?q=${encoded}&rank=FAMILY&limit=${limit}`;
  const payload = await fetchJson(url, { signal });

  return (Array.isArray(payload) ? payload : [])
    .map((item) => {
      const suggestion = toSuggestion(item, "family");
      if (!suggestion) {
        return null;
      }
      return {
        familyKey: suggestion.taxonKey,
        family: suggestion.scientificName,
        scientificName: suggestion.scientificName,
        kingdom: suggestion.kingdom,
        kingdomKey: suggestion.kingdomKey
      };
    })
    .filter(Boolean)
    .filter((item) => matchesKingdom(item, kingdomKey))
    .slice(0, limit);
}
