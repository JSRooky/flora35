// Добавляет находки из sourceFindings в targetFindings, пропуская дубликаты по id.
function appendUniqueFindings(targetFindings, sourceFindings) {
  const seenIds = new Set(
    targetFindings.map((finding) => finding?.id).filter(Boolean)
  );

  for (const finding of sourceFindings ?? []) {
    const findingId = finding?.id;

    if (findingId && seenIds.has(findingId)) {
      continue;
    }

    if (findingId) {
      seenIds.add(findingId);
    }

    targetFindings.push(finding);
  }
}

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

      appendUniqueFindings(existing.findings, species.findings);
    });
  });

  return {
    type: "SpeciesCollection",
    species: [...speciesById.values()]
  };
}
