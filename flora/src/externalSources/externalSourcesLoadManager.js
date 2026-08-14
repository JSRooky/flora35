import {
  getGbifNetworkErrorMessage,
  isGbifAbortError
} from "../gbif/gbifClient";
import {
  estimateGbifLoadSeriesCount,
  loadOccurrencesInSeries
} from "../gbif/gbifLoadSeries";
import {
  getGbifFeatureCount,
  getGbifLoadedRegionIds,
  getGbifSlimMapCollection,
  removeGbifRegionFromStore,
  setGbifLoadedQuery,
  setGbifSyncedAt,
  upsertGbifFeatures
} from "../gbif/gbifStore";
import {
  clearGbifStoreAndPersistence,
  persistGbifSnapshot
} from "../gbif/gbifPersistence";
import {
  getInatNetworkErrorMessage,
  isInatAbortError
} from "../inaturalist/inatClient";
import {
  estimateInatLoadSeriesCount,
  loadObservationsInSeries
} from "../inaturalist/inatLoadSeries";
import {
  getInatFeatureCount,
  getInatLoadedRegionIds,
  getInatSlimMapCollection,
  removeInatRegionFromStore,
  setInatLoadedQuery,
  setInatSyncedAt,
  upsertInatFeatures
} from "../inaturalist/inatStore";
import {
  clearInatStoreAndPersistence,
  persistInatSnapshot
} from "../inaturalist/inatPersistence";
import { clearGbifLayer, setGbifData, setGbifMapUpdatesPaused } from "../components/addGbifLayer";
import { clearInatLayer, setInatData, setInatMapUpdatesPaused } from "../components/addInatLayer";
import { setTempLayersData } from "../components/addTempLayersLayer";
import {
  prepareTempLayerStaging,
  upsertTempLayerStagingFeatures
} from "../tempLayers/tempLayerStore";

/**
 * Долгоживущая оркестрация загрузки GBIF/iNat.
 * Не привязана к монтированию панели «Источники данных»,
 * поэтому запросы продолжаются при сворачивании и закрытии UI.
 */

function createSourceState() {
  return {
    loading: false,
    error: null,
    fetched: 0,
    added: 0,
    total: null,
    loaded: 0,
    seriesIndex: null,
    seriesTotal: null,
    seriesLabel: null,
    lastSucceededQuery: null,
    lastSucceededKingdomId: "",
    lastSucceededQualityGrade: null,
    lastSucceededSyncedAt: null,
    generation: 0
  };
}

const listeners = new Set();

let snapshot = {
  gbif: createSourceState(),
  inat: createSourceState()
};

/** @type {import("mapbox-gl").Map | null} */
let mapRef = null;
/** @type {(() => void) | null} */
let onDataChangeRef = null;

/** @type {AbortController | null} */
let gbifAbort = null;
/** @type {AbortController | null} */
let inatAbort = null;

function emit() {
  const next = {
    gbif: { ...snapshot.gbif },
    inat: { ...snapshot.inat }
  };
  snapshot = next;
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch {
      // подписчик не должен ломать остальных
    }
  });
}

function patchSource(source, patch) {
  snapshot = {
    ...snapshot,
    [source]: { ...snapshot[source], ...patch }
  };
  emit();
}

function notifyDataChange() {
  try {
    onDataChangeRef?.();
  } catch {
    // контекст App мог быть временно недоступен
  }
}

/**
 * Карта и колбэк обновления UI живут в App; панель может быть размонтирована.
 * @param {{ map?: import("mapbox-gl").Map | null, onDataChange?: (() => void) | null }} ctx
 */
export function setExternalSourcesLoadContext(ctx = {}) {
  if ("map" in ctx) {
    mapRef = ctx.map ?? null;
  }
  if ("onDataChange" in ctx) {
    onDataChangeRef = ctx.onDataChange ?? null;
  }
}

export function getExternalSourcesLoadSnapshot() {
  return snapshot;
}

export function isExternalSourcesLoadActive() {
  return snapshot.gbif.loading || snapshot.inat.loading;
}

/**
 * @param {(snap: typeof snapshot) => void} listener
 * @returns {() => void}
 */
export function subscribeExternalSourcesLoad(listener) {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function cancelGbifExternalLoad() {
  gbifAbort?.abort();
}

export function cancelInatExternalLoad() {
  inatAbort?.abort();
}

/**
 * @param {{
 *   region: { id: string },
 *   kingdomId?: string,
 *   extras?: object,
 *   query: object,
 *   previewCount?: number | null
 * }} params
 */
export async function startGbifExternalLoad({
  region,
  kingdomId = "",
  extras = {},
  query,
  previewCount = null,
  intoTempStaging = false,
  taxon = null
} = {}) {
  const map = mapRef;
  if (!map || !region) {
    return;
  }

  const generation = snapshot.gbif.generation + 1;
  if (intoTempStaging) {
    prepareTempLayerStaging({ source: "gbif", taxon });
  } else {
    setGbifMapUpdatesPaused(true);
    clearGbifLayer(map);
  }
  patchSource("gbif", {
    loading: true,
    error: null,
    total: previewCount,
    added: 0,
    fetched: 0,
    loaded: getGbifFeatureCount(),
    seriesIndex: null,
    seriesTotal:
      previewCount != null ? estimateGbifLoadSeriesCount(previewCount) : null,
    seriesLabel: null,
    generation
  });

  gbifAbort?.abort();
  const controller = new AbortController();
  gbifAbort = controller;

  let addedTotal = 0;
  let fetchedTotal = 0;
  let succeeded = false;

  try {
    await loadOccurrencesInSeries(region, {
      signal: controller.signal,
      extras,
      previewCount,
      onSeriesStart: ({ series, index, planned, queued }) => {
        patchSource("gbif", {
          seriesIndex: index,
          seriesTotal: Math.max(planned, queued, index),
          seriesLabel: series.label
        });
      },
      onPage: (features) => {
        fetchedTotal += features.length;
        const { added } = intoTempStaging
          ? upsertTempLayerStagingFeatures(features, region.id)
          : upsertGbifFeatures(features, region.id);
        addedTotal += added;
        patchSource("gbif", {
          fetched: fetchedTotal,
          added: addedTotal,
          loaded: intoTempStaging ? addedTotal : getGbifFeatureCount()
        });
      },
      onProgress: ({ total: nextTotal }) => {
        // Общий «из N» держим по исходному preview региона, не по одной серии.
        if (previewCount == null && typeof nextTotal === "number") {
          patchSource("gbif", { total: nextTotal });
        }
      }
    });

    succeeded = true;
  } catch (err) {
    if (!isGbifAbortError(err, controller.signal)) {
      patchSource("gbif", { error: getGbifNetworkErrorMessage(err) });
    }
  } finally {
    if (gbifAbort === controller) {
      gbifAbort = null;
    }

    if (snapshot.gbif.generation !== generation) {
      return;
    }

    if (!intoTempStaging) {
      setGbifMapUpdatesPaused(false);
      if (map) {
        setGbifData(map, getGbifSlimMapCollection());
      }
    } else if (map) {
      setTempLayersData(map);
    }

    const nextSyncedAt = succeeded ? new Date().toISOString() : null;
    const resolvedQuery =
      query && typeof query === "object"
        ? query
        : { regionId: region.id, kingdomId: kingdomId || null };

    if (succeeded && !intoTempStaging) {
      setGbifLoadedQuery(resolvedQuery);
      setGbifSyncedAt(nextSyncedAt);
    }

    patchSource("gbif", {
      loading: false,
      seriesIndex: null,
      seriesTotal: null,
      seriesLabel: null,
      loaded: intoTempStaging ? addedTotal : getGbifFeatureCount(),
      ...(succeeded && !intoTempStaging
        ? {
            lastSucceededQuery: resolvedQuery,
            lastSucceededKingdomId: kingdomId || "",
            lastSucceededSyncedAt: nextSyncedAt
          }
        : {})
    });

    if (!intoTempStaging) {
      await persistGbifSnapshot();
    }
    notifyDataChange();
  }
}

/**
 * @param {{
 *   region: { id: string },
 *   kingdomId?: string,
 *   qualityGrade: string,
 *   extras?: object,
 *   query: object,
 *   previewCount?: number | null
 * }} params
 */
export async function startInatExternalLoad({
  region,
  kingdomId = "",
  qualityGrade,
  extras = {},
  query,
  previewCount = null,
  intoTempStaging = false,
  taxon = null
} = {}) {
  const map = mapRef;
  if (!map || !region) {
    return;
  }

  const generation = snapshot.inat.generation + 1;
  if (intoTempStaging) {
    prepareTempLayerStaging({ source: "inat", taxon });
  } else {
    setInatMapUpdatesPaused(true);
    clearInatLayer(map);
  }
  patchSource("inat", {
    loading: true,
    error: null,
    total: previewCount,
    added: 0,
    fetched: 0,
    loaded: getInatFeatureCount(),
    seriesIndex: null,
    seriesTotal:
      previewCount != null ? estimateInatLoadSeriesCount(previewCount) : null,
    seriesLabel: null,
    generation
  });

  inatAbort?.abort();
  const controller = new AbortController();
  inatAbort = controller;

  let addedTotal = 0;
  let fetchedTotal = 0;
  let succeeded = false;

  try {
    await loadObservationsInSeries(region, {
      signal: controller.signal,
      qualityGrade,
      extras,
      previewCount,
      onSeriesStart: ({ series, index, planned, queued }) => {
        patchSource("inat", {
          seriesIndex: index,
          seriesTotal: Math.max(planned, queued, index),
          seriesLabel: series.label
        });
      },
      onPage: (features) => {
        fetchedTotal += features.length;
        const { added } = intoTempStaging
          ? upsertTempLayerStagingFeatures(features, region.id)
          : upsertInatFeatures(features, region.id);
        addedTotal += added;
        patchSource("inat", {
          fetched: fetchedTotal,
          added: addedTotal,
          loaded: intoTempStaging ? addedTotal : getInatFeatureCount()
        });
      },
      onProgress: ({ total: nextTotal }) => {
        if (typeof nextTotal === "number") {
          patchSource("inat", { total: nextTotal });
        }
      }
    });

    succeeded = true;
  } catch (err) {
    if (!isInatAbortError(err, controller.signal)) {
      patchSource("inat", { error: getInatNetworkErrorMessage(err) });
    }
  } finally {
    if (inatAbort === controller) {
      inatAbort = null;
    }

    if (snapshot.inat.generation !== generation) {
      return;
    }

    if (!intoTempStaging) {
      setInatMapUpdatesPaused(false);
      if (map) {
        setInatData(map, getInatSlimMapCollection());
      }
    } else if (map) {
      setTempLayersData(map);
    }

    const nextSyncedAt = succeeded ? new Date().toISOString() : null;
    if (succeeded && !intoTempStaging) {
      setInatLoadedQuery(query);
      setInatSyncedAt(nextSyncedAt);
    }

    patchSource("inat", {
      loading: false,
      seriesIndex: null,
      seriesTotal: null,
      seriesLabel: null,
      loaded: intoTempStaging ? addedTotal : getInatFeatureCount(),
      ...(succeeded && !intoTempStaging
        ? {
            lastSucceededQuery: query,
            lastSucceededKingdomId: kingdomId || "",
            lastSucceededQualityGrade: qualityGrade,
            lastSucceededSyncedAt: nextSyncedAt
          }
        : {})
    });

    if (!intoTempStaging) {
      await persistInatSnapshot();
    }
    notifyDataChange();
  }
}

function resetSourceSnapshot(source) {
  patchSource(source, {
    loading: false,
    error: null,
    fetched: 0,
    added: 0,
    total: null,
    loaded: 0,
    seriesIndex: null,
    seriesTotal: null,
    seriesLabel: null,
    lastSucceededQuery: null,
    lastSucceededKingdomId: "",
    lastSucceededQualityGrade: null,
    lastSucceededSyncedAt: null
  });
}

/**
 * Удаляет локальный набор GBIF (память + IndexedDB + слой карты),
 * если он относится к указанному региону.
 * @param {string} regionId
 * @returns {Promise<boolean>} true, если набор был удалён
 */
export async function clearGbifExternalDataset(regionId) {
  if (!regionId || !getGbifLoadedRegionIds().has(regionId)) {
    return false;
  }

  cancelGbifExternalLoad();
  const result = removeGbifRegionFromStore(regionId);
  if (!result.removed) {
    return false;
  }

  setGbifMapUpdatesPaused(false);
  const map = mapRef;
  if (map) {
    if (getGbifFeatureCount() === 0) {
      clearGbifLayer(map);
    } else {
      setGbifData(map, getGbifSlimMapCollection());
    }
  }

  await persistGbifSnapshot();

  if (getGbifFeatureCount() === 0) {
    resetSourceSnapshot("gbif");
  } else {
    patchSource("gbif", { loaded: getGbifFeatureCount() });
  }

  notifyDataChange();
  return true;
}

/**
 * Удаляет локальный набор iNaturalist (память + IndexedDB + слой карты),
 * если он относится к указанному региону.
 * @param {string} regionId
 * @returns {Promise<boolean>} true, если набор был удалён
 */
export async function clearInatExternalDataset(regionId) {
  if (!regionId || !getInatLoadedRegionIds().has(regionId)) {
    return false;
  }

  cancelInatExternalLoad();
  const result = removeInatRegionFromStore(regionId);
  if (!result.removed) {
    return false;
  }

  setInatMapUpdatesPaused(false);
  const map = mapRef;
  if (map) {
    if (getInatFeatureCount() === 0) {
      clearInatLayer(map);
    } else {
      setInatData(map, getInatSlimMapCollection());
    }
  }

  await persistInatSnapshot();

  if (getInatFeatureCount() === 0) {
    resetSourceSnapshot("inat");
  } else {
    patchSource("inat", { loaded: getInatFeatureCount() });
  }

  notifyDataChange();
  return true;
}

/** Удаляет все локальные наборы GBIF и iNaturalist (память, IndexedDB, слои карты). */
export async function clearAllExternalDatasets() {
  cancelGbifExternalLoad();
  cancelInatExternalLoad();
  await clearGbifStoreAndPersistence();
  await clearInatStoreAndPersistence();
  setGbifMapUpdatesPaused(false);
  setInatMapUpdatesPaused(false);

  const map = mapRef;
  if (map) {
    clearGbifLayer(map);
    clearInatLayer(map);
  }

  resetSourceSnapshot("gbif");
  resetSourceSnapshot("inat");
  notifyDataChange();
}
