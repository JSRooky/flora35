import { countGbifFeaturesByRegionId, getGbifLoadedRegionIds } from "../gbif/gbifStore";
import { countInatFeaturesByRegionId, getInatLoadedRegionIds } from "../inaturalist/inatStore";

let rememberedExternalIds = new Set();
let rememberedStats = new Map();
let externalWorkingSetHeld = false;

function addIds(target, ids) {
  ids.forEach((id) => {
    if (id) {
      target.add(String(id));
    }
  });
}

export function collectLiveExternalRegionIds() {
  const ids = new Set();
  addIds(ids, getGbifLoadedRegionIds());
  addIds(ids, countGbifFeaturesByRegionId().keys());
  addIds(ids, getInatLoadedRegionIds());
  addIds(ids, countInatFeaturesByRegionId().keys());
  return ids;
}

function snapshotStatsFromStores() {
  const gbifCounts = countGbifFeaturesByRegionId();
  const inatCounts = countInatFeaturesByRegionId();
  const stats = new Map();

  const touch = (id, patch) => {
    const key = String(id);
    const current = stats.get(key) || { gbif: 0, inat: 0 };
    stats.set(key, { ...current, ...patch });
  };

  gbifCounts.forEach((count, id) => touch(id, { gbif: count }));
  inatCounts.forEach((count, id) => touch(id, { inat: count }));
  collectLiveExternalRegionIds().forEach((id) => {
    if (!stats.has(String(id))) {
      stats.set(String(id), { gbif: 0, inat: 0 });
    }
  });
  return stats;
}

/** Слой GBIF/iNat выгружен из RAM; контуры регионов всё равно показываем. */
export function markExternalWorkingSetUnloaded() {
  const live = collectLiveExternalRegionIds();
  if (live.size > 0) {
    rememberedExternalIds = live;
    rememberedStats = snapshotStatsFromStores();
  }
  externalWorkingSetHeld = false;
}

/** Слой GBIF/iNat снова в RAM — индикация следует за фактическими данными. */
export function markExternalWorkingSetLoaded() {
  externalWorkingSetHeld = true;
  rememberedExternalIds = collectLiveExternalRegionIds();
  rememberedStats = snapshotStatsFromStores();
}

export function listIndicatedExternalRegionIds() {
  if (externalWorkingSetHeld) {
    return collectLiveExternalRegionIds();
  }
  return new Set(rememberedExternalIds);
}

/** Счётчики GBIF/iNat по региону: живые или снимок после выгрузки RAM. */
export function getIndicatedExternalRegionStats() {
  if (externalWorkingSetHeld) {
    return snapshotStatsFromStores();
  }
  return rememberedStats;
}

export function resetLoadedRegionIndicationForTests() {
  rememberedExternalIds = new Set();
  rememberedStats = new Map();
  externalWorkingSetHeld = false;
}
