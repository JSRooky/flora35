import {
  GBIF_MAP_UPDATE_PAGES,
  getGbifNetworkErrorMessage,
  isGbifAbortError
} from "../gbif/gbifClient";
import {
  estimateGbifLoadSeriesCount,
  loadOccurrencesInSeries
} from "../gbif/gbifLoadSeries";
import {
  getGbifFeatureCollection,
  getGbifFeatureCount,
  setGbifLoadedQuery,
  setGbifSyncedAt,
  upsertGbifFeatures
} from "../gbif/gbifStore";
import { persistGbifSnapshot } from "../gbif/gbifPersistence";
import {
  INAT_MAP_UPDATE_PAGES,
  getInatNetworkErrorMessage,
  isInatAbortError
} from "../inaturalist/inatClient";
import {
  estimateInatLoadSeriesCount,
  loadObservationsInSeries
} from "../inaturalist/inatLoadSeries";
import {
  getInatFeatureCollection,
  getInatFeatureCount,
  setInatLoadedQuery,
  setInatSyncedAt,
  upsertInatFeatures
} from "../inaturalist/inatStore";
import { persistInatSnapshot } from "../inaturalist/inatPersistence";
import { setGbifData } from "../components/addGbifLayer";
import { setInatData } from "../components/addInatLayer";

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
  previewCount = null
} = {}) {
  const map = mapRef;
  if (!map || !region) {
    return;
  }

  gbifAbort?.abort();
  const controller = new AbortController();
  gbifAbort = controller;

  const generation = snapshot.gbif.generation + 1;
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

  let pagesSinceMapUpdate = 0;
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
        const { collection, added } = upsertGbifFeatures(features, region.id);
        addedTotal += added;
        patchSource("gbif", {
          fetched: fetchedTotal,
          added: addedTotal,
          loaded: collection.features.length
        });
        pagesSinceMapUpdate += 1;
        if (pagesSinceMapUpdate >= GBIF_MAP_UPDATE_PAGES) {
          setGbifData(map, collection);
          pagesSinceMapUpdate = 0;
        }
      },
      onProgress: ({ total: nextTotal }) => {
        // Общий «из N» держим по исходному preview региона, не по одной серии.
        if (previewCount == null && typeof nextTotal === "number") {
          patchSource("gbif", { total: nextTotal });
        }
      }
    });

    setGbifData(map, getGbifFeatureCollection());
    succeeded = true;
  } catch (err) {
    if (!isGbifAbortError(err, controller.signal)) {
      patchSource("gbif", { error: getGbifNetworkErrorMessage(err) });
    } else {
      setGbifData(map, getGbifFeatureCollection());
    }
  } finally {
    if (gbifAbort === controller) {
      gbifAbort = null;
    }

    const nextSyncedAt = succeeded ? new Date().toISOString() : null;
    const resolvedQuery =
      query && typeof query === "object"
        ? query
        : { regionId: region.id, kingdomId: kingdomId || null };

    if (succeeded) {
      setGbifLoadedQuery(resolvedQuery);
      setGbifSyncedAt(nextSyncedAt);
    }

    patchSource("gbif", {
      loading: false,
      seriesIndex: null,
      seriesTotal: null,
      seriesLabel: null,
      loaded: getGbifFeatureCount(),
      ...(succeeded
        ? {
            lastSucceededQuery: resolvedQuery,
            lastSucceededKingdomId: kingdomId || "",
            lastSucceededSyncedAt: nextSyncedAt
          }
        : {})
    });

    await persistGbifSnapshot();
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
  previewCount = null
} = {}) {
  const map = mapRef;
  if (!map || !region) {
    return;
  }

  inatAbort?.abort();
  const controller = new AbortController();
  inatAbort = controller;

  const generation = snapshot.inat.generation + 1;
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

  let pagesSinceMapUpdate = 0;
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
        const { collection, added } = upsertInatFeatures(features, region.id);
        addedTotal += added;
        patchSource("inat", {
          fetched: fetchedTotal,
          added: addedTotal,
          loaded: collection.features.length
        });
        pagesSinceMapUpdate += 1;
        if (pagesSinceMapUpdate >= INAT_MAP_UPDATE_PAGES) {
          setInatData(map, collection);
          pagesSinceMapUpdate = 0;
        }
      },
      onProgress: ({ total: nextTotal }) => {
        if (typeof nextTotal === "number") {
          patchSource("inat", { total: nextTotal });
        }
      }
    });

    setInatData(map, getInatFeatureCollection());
    succeeded = true;
  } catch (err) {
    if (!isInatAbortError(err, controller.signal)) {
      patchSource("inat", { error: getInatNetworkErrorMessage(err) });
    } else {
      setInatData(map, getInatFeatureCollection());
    }
  } finally {
    if (inatAbort === controller) {
      inatAbort = null;
    }

    const nextSyncedAt = succeeded ? new Date().toISOString() : null;
    if (succeeded) {
      setInatLoadedQuery(query);
      setInatSyncedAt(nextSyncedAt);
    }

    patchSource("inat", {
      loading: false,
      seriesIndex: null,
      seriesTotal: null,
      seriesLabel: null,
      loaded: getInatFeatureCount(),
      ...(succeeded
        ? {
            lastSucceededQuery: query,
            lastSucceededKingdomId: kingdomId || "",
            lastSucceededQualityGrade: qualityGrade,
            lastSucceededSyncedAt: nextSyncedAt
          }
        : {})
    });

    await persistInatSnapshot();
    notifyDataChange();
  }
}
