const INAT_TAXA_URL = "https://api.inaturalist.org/v1/taxa";

function normalizeQuery(query) {
  return String(query ?? "").trim();
}

function normalizeRank(rank) {
  const raw = String(rank ?? "").trim().toLowerCase();
  return raw || null;
}

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal, mode: "cors", credentials: "omit" });
  if (!response.ok) {
    throw new Error(`iNaturalist Taxa API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function toSuggestion(raw) {
  const id = raw?.id;
  if (id == null || id === 0) {
    return null;
  }

  const scientificName = raw.name || raw.matched_term || null;
  if (!scientificName) {
    return null;
  }

  return {
    taxonId: id,
    scientificName,
    vernacularName: raw.preferred_common_name || raw.english_common_name || null,
    rank: raw.rank ? String(raw.rank).toUpperCase() : null,
    iconicTaxonName: raw.iconic_taxon_name || null
  };
}

/**
 * Подсказки таксонов iNaturalist (`/v1/taxa`).
 */
export async function suggestInatTaxa(
  query,
  { rank = null, limit = 8, signal } = {}
) {
  const q = normalizeQuery(query);
  if (q.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q,
    per_page: String(limit)
  });
  const rankName = normalizeRank(rank);
  if (rankName) {
    params.set("rank", rankName);
  }

  const payload = await fetchJson(`${INAT_TAXA_URL}?${params.toString()}`, { signal });
  return (payload?.results ?? []).map(toSuggestion).filter(Boolean);
}

/**
 * Лучшее совпадение iNat по латинскому имени (точное имя, иначе первый результат).
 */
export async function matchInatTaxon(name, { rank = null, signal } = {}) {
  const q = normalizeQuery(name);
  if (!q) {
    return null;
  }

  const results = await suggestInatTaxa(q, { rank, limit: 10, signal });
  if (results.length === 0) {
    return null;
  }

  const lower = q.toLowerCase();
  const exact = results.find(
    (item) => String(item.scientificName || "").toLowerCase() === lower
  );
  return exact ?? results[0];
}
