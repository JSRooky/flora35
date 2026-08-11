import {
  getOverlayEntry,
  setCachedRussianName,
  seedOverlayInMemory
} from "../names/nameRuCache";
import { normalizeLatinName } from "../names/vernacularUtils";

/**
 * Переносит name_ru из iNaturalist snapshot в overlay и очищает raw features.
 * @returns {Promise<{ collection: object, migrated: number, stripped: number }>}
 */
export async function migrateInatNameRuToOverlay(collection) {
  if (!collection?.features?.length) {
    return { collection, migrated: 0, stripped: 0 };
  }

  const seededKeys = new Set();
  let migrated = 0;
  let stripped = 0;

  for (const feature of collection.features) {
    if (feature?.properties?.source !== "inaturalist") {
      continue;
    }

    const nameLatin = feature.properties?.name_latin;
    const nameRu = feature.properties?.name_ru;

    if (nameRu && nameLatin) {
      const normalized = normalizeLatinName(nameLatin);
      if (!getOverlayEntry(normalized) && !getOverlayEntry(nameLatin)) {
        seedOverlayInMemory(normalized, { nameRu, source: "migrated" });
        seededKeys.add(normalized);
        migrated += 1;
      }
    }
  }

  for (const key of seededKeys) {
    const entry = getOverlayEntry(key);
    if (entry) {
      await setCachedRussianName(key, {
        nameRu: entry.nameRu,
        source: entry.source
      });
    }
  }

  const features = collection.features.map((feature) => {
    if (feature?.properties?.source !== "inaturalist" || !feature.properties?.name_ru) {
      return feature;
    }

    stripped += 1;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        name_ru: null
      }
    };
  });

  return {
    collection: {
      ...collection,
      features
    },
    migrated,
    stripped
  };
}
