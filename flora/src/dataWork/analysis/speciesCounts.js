import { normalizeLatinName } from "../normalizeLatinName";

/** Обилие видов по латинскому названию. */
export function speciesAbundance(features) {
  const counts = new Map();
  let unnamed = 0;

  (Array.isArray(features) ? features : []).forEach((feature) => {
    const key = normalizeLatinName(feature?.properties?.name_latin);
    if (!key) {
      unnamed += 1;
      return;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return { counts, unnamed, named: [...counts.values()].reduce((sum, value) => sum + value, 0) };
}

export function uniqueSpeciesLatin(features) {
  const names = new Set();
  (Array.isArray(features) ? features : []).forEach((feature) => {
    const raw = String(feature?.properties?.name_latin ?? "").trim();
    const key = normalizeLatinName(raw);
    if (key) {
      names.add(raw || key);
    }
  });
  return [...names];
}
