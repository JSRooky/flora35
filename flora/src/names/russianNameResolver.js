import { matchScientificName } from "../gbif/speciesLookup";
import { getAllSpeciesCollection } from "../locations/loadPoints";
import { getCachedRussianName, setCachedRussianName } from "./nameRuCache";
import {
  isRussianVernacular,
  normalizeLatinName,
  pickRussianVernacular
} from "./vernacularUtils";

const GBIF_SPECIES_URL = "https://api.gbif.org/v1/species";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

async function fetchJson(url, { signal, headers = {} } = {}) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function findLocalRussianName(nameLatin) {
  const normalized = normalizeLatinName(nameLatin).toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const species of getAllSpeciesCollection().species ?? []) {
    const latin = String(species.name_latin ?? "").trim();
    if (!latin) {
      continue;
    }

    if (normalizeLatinName(latin).toLowerCase() === normalized) {
      const nameRu = String(species.name_ru ?? "").trim();
      return nameRu || null;
    }
  }

  return null;
}

async function fetchGbifRussianName(speciesKey, { signal } = {}) {
  if (speciesKey == null || speciesKey === "") {
    return null;
  }

  const key = String(speciesKey);

  try {
    const usage = await fetchJson(`${GBIF_SPECIES_URL}/${key}?language=ru`, { signal });
    if (usage?.vernacularName && isRussianVernacular(usage.vernacularName)) {
      return usage.vernacularName;
    }
  } catch {
    // fallback to vernacularNames list
  }

  try {
    const payload = await fetchJson(`${GBIF_SPECIES_URL}/${key}/vernacularNames?limit=100`, {
      signal
    });
    return pickRussianVernacular(payload?.results ?? payload);
  } catch {
    return null;
  }
}

async function resolveSpeciesKey(nameLatin, speciesKey, { signal } = {}) {
  if (speciesKey != null && speciesKey !== "") {
    return speciesKey;
  }

  const matched = await matchScientificName(normalizeLatinName(nameLatin), { signal });
  return matched?.taxonKey ?? null;
}

function escapeSparqlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fetchWikidataRussianName(nameLatin, { signal } = {}) {
  const sciName = normalizeLatinName(nameLatin);
  if (!sciName) {
    return null;
  }

  const query = `
SELECT ?commonName ?label WHERE {
  ?taxon wdt:P225 "${escapeSparqlString(sciName)}" .
  OPTIONAL {
    ?taxon wdt:P1843 ?commonName .
    FILTER(LANG(?commonName) = "ru")
  }
  OPTIONAL {
    ?taxon rdfs:label ?label .
    FILTER(LANG(?label) = "ru")
  }
}
LIMIT 1`.trim();

  const url = `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(query)}`;

  const payload = await fetchJson(url, {
    signal,
    headers: {
      Accept: "application/sparql-results+json"
    }
  });

  const binding = payload?.results?.bindings?.[0];
  if (!binding) {
    return null;
  }

  const commonName = binding.commonName?.value;
  if (commonName && isRussianVernacular(commonName)) {
    return commonName;
  }

  const label = binding.label?.value;
  if (label && isRussianVernacular(label)) {
    return label;
  }

  return null;
}

/**
 * Ищет русское название вида по латинскому имени.
 * @returns {Promise<{ nameRu: string|null, source: 'local'|'gbif'|'wikidata'|null, cached: boolean }>}
 */
export async function resolveRussianName({ nameLatin, speciesKey = null, signal } = {}) {
  const normalizedLatin = normalizeLatinName(nameLatin);
  if (!normalizedLatin) {
    return { nameRu: null, source: null, cached: false };
  }

  const cached = await getCachedRussianName(normalizedLatin);
  if (cached) {
    return {
      nameRu: cached.nameRu,
      source: cached.source,
      cached: true
    };
  }

  const localName = findLocalRussianName(normalizedLatin);
  if (localName) {
    await setCachedRussianName(normalizedLatin, { nameRu: localName, source: "local" });
    return { nameRu: localName, source: "local", cached: false };
  }

  const resolvedKey = await resolveSpeciesKey(normalizedLatin, speciesKey, { signal });
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const gbifName = await fetchGbifRussianName(resolvedKey, { signal });
  if (gbifName) {
    await setCachedRussianName(normalizedLatin, { nameRu: gbifName, source: "gbif" });
    return { nameRu: gbifName, source: "gbif", cached: false };
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const wikidataName = await fetchWikidataRussianName(normalizedLatin, { signal });
  if (wikidataName) {
    await setCachedRussianName(normalizedLatin, { nameRu: wikidataName, source: "wikidata" });
    return { nameRu: wikidataName, source: "wikidata", cached: false };
  }

  await setCachedRussianName(normalizedLatin, { nameRu: null, source: null });
  return { nameRu: null, source: null, cached: false };
}
