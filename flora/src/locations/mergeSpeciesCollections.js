/** Объединяет несколько SpeciesCollection в одну коллекцию (findings склеиваются по id вида). */
export function mergeSpeciesCollections(...collections) {
  const speciesById = new Map();

  collections.forEach((collection) => {
    if (!collection || collection.type !== "SpeciesCollection" || !Array.isArray(collection.species)) {
      return;
    }

    collection.species.forEach((species) => {
      const existing = speciesById.get(species.id);

      if (!existing) {
        speciesById.set(species.id, {
          ...species,
          findings: [...(species.findings ?? [])]
        });
        return;
      }

      existing.findings.push(...(species.findings ?? []));
    });
  });

  return {
    type: "SpeciesCollection",
    species: [...speciesById.values()]
  };
}
