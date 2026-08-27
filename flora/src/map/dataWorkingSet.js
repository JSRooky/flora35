import { DATA_SOURCE_MODES } from "../locations/loadPoints";
import {
  clearGbifStore,
  getGbifFeatureCount,
  getGbifSlimMapCollection
} from "../gbif/gbifStore";
import { hydrateGbifStoreFromPersistence } from "../gbif/gbifPersistence";
import { clearInatStore, getInatFeatureCount, getInatSlimMapCollection } from "../inaturalist/inatStore";
import { hydrateInatStoreFromPersistence } from "../inaturalist/inatPersistence";
import { clearGbifLayer, setGbifData } from "../components/addGbifLayer";
import { clearInatLayer, setInatData } from "../components/addInatLayer";
import { setRegionLoadSummaryActive, setRegionLoadSummaryMode, shouldSuppressLoadedPointLayers } from "./regionLoadSummary";
import {
  markExternalWorkingSetLoaded,
  markExternalWorkingSetUnloaded
} from "./loadedRegionIndication";
import { clearRegionLoadSummary, refreshRegionLoadSummary } from "../components/addRegionLoadSummaryLayer";
import { getCompactGridPointLimit } from "./compactGridSettings";
import {
  isCompactPointDisplayEnabled,
  setCompactPointDisplayEnabled
} from "./compactPointDisplay";
import {
  hydrateTempLayersFromPersistence,
  persistTempLayers
} from "../tempLayers/tempLayerPersistence";
import {
  areTempLayerGeometriesHeld,
  unloadTempLayerGeometries
} from "../tempLayers/tempLayerStore";
import {
  clearTempLayersLayer,
  setTempLayersData,
  setTempLayersVisibility
} from "../components/addTempLayersLayer";

let activationSeq = 0;

export function isExternalDataSourceMode(mode) {
  return mode === DATA_SOURCE_MODES.EXTERNAL || mode === DATA_SOURCE_MODES.GBIF;
}

export function isTempDataSourceMode(mode) {
  return mode === DATA_SOURCE_MODES.TEMP;
}

async function unloadExternalWorkingSet(map) {
  markExternalWorkingSetUnloaded();
  clearRegionLoadSummary();
  if (getGbifFeatureCount() === 0 && getInatFeatureCount() === 0) {
    if (map) {
      clearGbifLayer(map);
      clearInatLayer(map);
    }
    return;
  }
  clearGbifStore();
  clearInatStore();
  if (map) {
    clearGbifLayer(map);
    clearInatLayer(map);
  }
}

/**
 * Если после гидратации точек больше безопасного лимита — включаем
 * компактный режим ДО построения полной коллекции фич, чтобы не
 * материализовать сотни тысяч точек и не строить по ним Supercluster-индекс
 * (именно это раньше приводило к Out of Memory).
 */
function forceCompactModeIfOverLimit() {
  if (isCompactPointDisplayEnabled()) {
    return true;
  }
  const total = getGbifFeatureCount() + getInatFeatureCount();
  if (total > getCompactGridPointLimit()) {
    setCompactPointDisplayEnabled(true);
    return true;
  }
  return false;
}

async function loadExternalWorkingSet(map) {
  if (getGbifFeatureCount() === 0) {
    await hydrateGbifStoreFromPersistence();
  }
  if (getInatFeatureCount() === 0) {
    await hydrateInatStoreFromPersistence();
  }

  markExternalWorkingSetLoaded();

  const compact = forceCompactModeIfOverLimit();

  if (map) {
    if (shouldSuppressLoadedPointLayers()) {
      setGbifData(map, { type: "FeatureCollection", features: [] });
      setInatData(map, { type: "FeatureCollection", features: [] });
      refreshRegionLoadSummary(map);
    } else {
      setGbifData(map, compact ? undefined : getGbifSlimMapCollection());
      setInatData(map, compact ? undefined : getInatSlimMapCollection());
    }
  }
}

async function unloadTempWorkingSet(map) {
  if (areTempLayerGeometriesHeld()) {
    await persistTempLayers();
    unloadTempLayerGeometries();
  }
  if (map) {
    clearTempLayersLayer(map);
  }
}

async function loadTempWorkingSet(map) {
  if (!areTempLayerGeometriesHeld()) {
    await hydrateTempLayersFromPersistence();
  }
  if (map) {
    setTempLayersData(map);
    setTempLayersVisibility(map, true);
    refreshRegionLoadSummary(map);
  }
}

/**
 * В RAM остаётся только активный слой данных: GBIF/iNat и временные слои
 * не живут в памяти одновременно.
 */
export async function syncDataWorkingSet({ mode, map } = {}) {
  const seq = ++activationSeq;

  if (!isExternalDataSourceMode(mode)) {
    setRegionLoadSummaryActive(false);
    await unloadExternalWorkingSet(map);
  }
  if (!isTempDataSourceMode(mode)) {
    await unloadTempWorkingSet(map);
  }

  if (seq !== activationSeq) {
    return seq;
  }

  if (isExternalDataSourceMode(mode)) {
    setRegionLoadSummaryActive(true);
    setRegionLoadSummaryMode("external");
    await loadExternalWorkingSet(map);
  }

  if (seq !== activationSeq) {
    return seq;
  }

  if (isTempDataSourceMode(mode)) {
    setRegionLoadSummaryActive(true);
    setRegionLoadSummaryMode("temp");
    await loadTempWorkingSet(map);
  }

  return seq;
}
