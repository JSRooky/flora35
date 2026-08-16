import { matchScientificName } from "../gbif/speciesLookup";
import { gbifFetch } from "../gbif/gbifRequestQueue";
import { getAllSpeciesCollection } from "../locations/loadPoints";
import { getCachedRussianName, setCachedRussianName, clearCachedRussianName } from "./nameRuCache";
import {
  collectRussianVernaculars,
  isRussianVernacular,
  normalizeLatinName
} from "./vernacularUtils";

const GBIF_SPECIES_URL = "https://api.gbif.org/v1/species";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

const SOURCE_LABELS = {
  local: "Локальные данные",
  gbif: "GBIF",
  wikidata: "Wikidata"
};

async function fetchJson(url, { signal, headers = {} } = {}) {
  const isGbif = String(url).includes("api.gbif.org");
  const response = isGbif
    ? await gbifFetch(url, { signal, headers })
    : await fetch(url, { signal, headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function addCandidate(bucket, seen, nameRu, source) {
  const name = String(nameRu ?? "").trim();
  if (!name || !isRussianVernacular(name)) {
    return;
  }

  const key = name.toLowerCase();
  if (seen.has(key)) {
    const existing = bucket.find((item) => item.nameRu.toLowerCase() === key);
    if (existing && !existing.sources.includes(source)) {
      existing.sources.push(source);
    }
    return;
  }

  seen.add(key);
  bucket.push({
    nameRu: name,
    source,
    sources: [source]
  });
}

function findLocalRussianNames(nameLatin) {
  const normalized = normalizeLatinName(nameLatin).toLowerCase();
  if (!normalized) {
    return [];
  }

  const names = [];
  const seen = new Set();

  for (const species of getAllSpeciesCollection().species ?? []) {
    const latin = String(species.name_latin ?? "").trim();
    if (!latin) {
      continue;
    }

    if (normalizeLatinName(latin).toLowerCase() !== normalized) {
      continue;
    }

    const nameRu = String(species.name_ru ?? "").trim();
    if (!nameRu) {
      continue;
    }

    const key = nameRu.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(nameRu);
  }

  return names;
}

async function fetchGbifRussianNames(speciesKey, { signal } = {}) {
  if (speciesKey == null || speciesKey === "") {
    return [];
  }

  const key = String(speciesKey);
  const names = [];
  const seen = new Set();

  const pushName = (value) => {
    const name = String(value ?? "").trim();
    if (!name || !isRussianVernacular(name)) {
      return;
    }

    const normalized = name.toLowerCase();
    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    names.push(name);
  };

  try {
    const usage = await fetchJson(`${GBIF_SPECIES_URL}/${key}?language=ru`, { signal });
    pushName(usage?.vernacularName);
  } catch {
    // fallback to vernacularNames list
  }

  try {
    const payload = await fetchJson(`${GBIF_SPECIES_URL}/${key}/vernacularNames?limit=100`, {
      signal
    });
    collectRussianVernaculars(payload?.results ?? payload).forEach(pushName);
  } catch {
    // keep whatever we already collected
  }

  return names;
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

async function fetchWikidataRussianNames(nameLatin, { signal } = {}) {
  const sciName = normalizeLatinName(nameLatin);
  if (!sciName) {
    return [];
  }

  const query = `
SELECT DISTINCT ?name WHERE {
  ?taxon wdt:P225 "${escapeSparqlString(sciName)}" .
  {
    ?taxon wdt:P1843 ?name .
    FILTER(LANG(?name) = "ru")
  }
  UNION
  {
    ?taxon rdfs:label ?name .
    FILTER(LANG(?name) = "ru")
  }
}
LIMIT 20`.trim();

  const url = `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(query)}`;

  const payload = await fetchJson(url, {
    signal,
    headers: {
      Accept: "application/sparql-results+json"
    }
  });

  const names = [];
  const seen = new Set();

  (payload?.results?.bindings ?? []).forEach((binding) => {
    const name = String(binding?.name?.value ?? "").trim();
    if (!name || !isRussianVernacular(name)) {
      return;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    names.push(name);
  });

  return names;
}

/** Человекочитаемая метка источника варианта названия. */
export function getRussianNameSourceLabel(source) {
  if (Array.isArray(source)) {
    return source.map((item) => SOURCE_LABELS[item] ?? item).filter(Boolean).join(", ");
  }

  return SOURCE_LABELS[source] ?? source ?? "";
}

/**
 * Ищет варианты русского названия вида (без автосохранения выбора).
 * @returns {Promise<{
 *   candidates: Array<{ nameRu: string, source: string, sources: string[] }>,
 *   cached: boolean
 * }>}
 */
export async function lookupRussianNameCandidates({
  nameLatin,
  speciesKey = null,
  signal,
  force = false
} = {}) {
  const normalizedLatin = normalizeLatinName(nameLatin);
  if (!normalizedLatin) {
    return { candidates: [], cached: false };
  }

  if (!force) {
    const cached = await getCachedRussianName(normalizedLatin);
    if (cached) {
      if (cached.nameRu) {
        return {
          candidates: [
            {
              nameRu: cached.nameRu,
              source: cached.source,
              sources: cached.source ? [cached.source] : []
            }
          ],
          cached: true
        };
      }

      return { candidates: [], cached: true };
    }
  }

  const candidates = [];
  const seen = new Set();

  findLocalRussianNames(normalizedLatin).forEach((nameRu) => {
    addCandidate(candidates, seen, nameRu, "local");
  });

  const resolvedKey = await resolveSpeciesKey(normalizedLatin, speciesKey, { signal });
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const gbifNames = await fetchGbifRussianNames(resolvedKey, { signal });
  gbifNames.forEach((nameRu) => {
    addCandidate(candidates, seen, nameRu, "gbif");
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  try {
    const wikidataNames = await fetchWikidataRussianNames(normalizedLatin, { signal });
    wikidataNames.forEach((nameRu) => {
      addCandidate(candidates, seen, nameRu, "wikidata");
    });
  } catch {
    // Wikidata — необязательный источник; ошибки не блокируют GBIF/local.
  }

  if (candidates.length === 0) {
    if (force) {
      // Не затираем уже выбранное имя, если повторный поиск ничего не нашёл.
      const existing = await getCachedRussianName(normalizedLatin);
      if (!existing?.nameRu) {
        await setCachedRussianName(normalizedLatin, { nameRu: null, source: null });
      }
    } else {
      await setCachedRussianName(normalizedLatin, { nameRu: null, source: null });
    }
  }

  return { candidates, cached: false };
}

/** Сохраняет выбранное пользователем русское название в overlay. */
export async function saveRussianNameChoice(nameLatin, { nameRu, source = null } = {}) {
  const normalizedLatin = normalizeLatinName(nameLatin);
  if (!normalizedLatin || !nameRu) {
    return null;
  }

  return setCachedRussianName(normalizedLatin, {
    nameRu,
    source: Array.isArray(source) ? source[0] ?? null : source
  });
}

/** Сбрасывает сохранённое русское название (и отрицательный кэш) для вида. */
export async function clearRussianNameChoice(nameLatin) {
  return clearCachedRussianName(normalizeLatinName(nameLatin));
}

/**
 * Ищет русское название вида по латинскому имени.
 * Для UI с выбором варианта предпочтительнее lookupRussianNameCandidates + saveRussianNameChoice.
 * @returns {Promise<{ nameRu: string|null, source: 'local'|'gbif'|'wikidata'|null, cached: boolean }>}
 */
export async function resolveRussianName({ nameLatin, speciesKey = null, signal } = {}) {
  const result = await lookupRussianNameCandidates({ nameLatin, speciesKey, signal });
  const first = result.candidates[0] ?? null;

  if (first && !result.cached) {
    await saveRussianNameChoice(nameLatin, {
      nameRu: first.nameRu,
      source: first.source
    });
  }

  return {
    nameRu: first?.nameRu ?? null,
    source: first?.source ?? null,
    cached: result.cached
  };
}
