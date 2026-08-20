import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INAT_QUALITY_MODES
} from "../inaturalist/inatClient";
import {
  TAXON_LOAD_MODES,
  attachInatTaxonId,
  buildGbifLoadExtras,
  resolveGbifLoadTaxon,
  taxonQueryFields
} from "../gbif/taxonLoadSelection";
import {
  isExternalSourcesLoadActive,
  startGbifExternalLoad,
  startInatExternalLoad,
  cancelGbifExternalLoad,
  cancelInatExternalLoad,
  subscribeExternalSourcesLoad
} from "../externalSources/externalSourcesLoadManager";
import {
  EXTERNAL_REGIONS,
  toGbifSpatialRegion,
  toInatSpatialRegion
} from "../externalSources/regions";
import { withLoadSpatialOverride } from "../externalSources/bufferedSpatialRegion";
import {
  createEmptyRegionTaxonCountMap,
  fetchRegionTaxonCounts
} from "../externalSources/fetchRegionKingdomPreviews";
import TaxonLoadPicker, {
  splitTaxonQueryNames,
  suggestionLabel
} from "./TaxonLoadPicker";
import {
  getTempLayerStaging,
  getTempLayerStagingCount,
  commitTempLayerStaging,
  clearTempLayerStaging
} from "../tempLayers/tempLayerStore";
import { persistTempLayers } from "../tempLayers/tempLayerPersistence";
import { DownloadIcon, SearchIcon } from "../images/buttons";
import PanelHint from "./PanelHint";

const SOURCE_GBIF = "gbif";
const SOURCE_INAT = "inat";
const SOURCE_ALL = "all";

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Number(value));
}

function buildLoadQuery(regionId, taxon) {
  return {
    regionId,
    kingdomId: taxon?.kingdomId ?? null,
    kingdomIds: taxon?.kingdomId ? [taxon.kingdomId] : null,
    ...taxonQueryFields(taxon)
  };
}

function previewCellText(preview, hasSpatial) {
  if (!hasSpatial || preview?.status === "unavailable") {
    return "—";
  }
  if (preview?.status === "loading") {
    return "…";
  }
  return formatCount(preview?.count);
}

function mergeCountPreview(prev, regionId, preview) {
  const existing = prev[regionId];
  if (preview?.status === "ready" && typeof preview.count === "number") {
    const previous = typeof existing?.count === "number" ? existing.count : 0;
    return { ...prev, [regionId]: { count: previous + preview.count, status: "ready" } };
  }
  if (preview?.status === "loading" && existing?.status === "ready") {
    return prev;
  }
  if (existing?.status === "ready") {
    return prev;
  }
  return { ...prev, [regionId]: preview };
}

function formatTaxaBundleName(taxa) {
  if (!taxa.length) {
    return "";
  }
  if (taxa.length === 1) {
    return taxa[0].scientificName;
  }
  return `${taxa[0].scientificName} +${taxa.length - 1}`;
}

function taxaBundleKey(source, taxa) {
  const keys = taxa
    .map((taxon) => String(taxon.taxonKey ?? taxon.familyKey ?? taxon.inatTaxonId ?? ""))
    .filter(Boolean)
    .sort();
  return `${source}|bundle|${keys.join(",")}`;
}

function toBundleTaxon(taxa) {
  if (!taxa.length) {
    return null;
  }
  const taxonKeys = taxa.map((taxon) => taxon.taxonKey).filter((key) => key != null);
  return {
    ...taxa[0],
    scientificName: formatTaxaBundleName(taxa),
    taxonKeys
  };
}

function countSettledRegions(countMap, regions) {
  let settled = 0;
  regions.forEach((region) => {
    const status = countMap[region.id]?.status;
    if (status === "ready" || status === "error" || status === "unavailable") {
      settled += 1;
    }
  });
  return settled;
}

function sumRegionCounts(countMap, regions) {
  let sum = 0;
  let any = false;
  regions.forEach((region) => {
    const value = countMap[region.id]?.count;
    if (typeof value === "number") {
      sum += value;
      any = true;
    }
  });
  return any ? sum : null;
}

export default function SelectiveLoadPopup({
  open = false,
  map = null,
  loading = false,
  loadSnapshot = null,
  loadError = null,
  onClose,
  onLoadError,
  onTempLayersChange,
  onSaveToRegionTempLayer,
  focusRegions = null,
  spatialByRegionId = null,
  unmatchedLabels = []
}) {
  const [source, setSource] = useState(SOURCE_GBIF);
  const [mode, setMode] = useState(TAXON_LOAD_MODES.SPECIES);
  const [query, setQuery] = useState("");
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [resolvedTaxa, setResolvedTaxa] = useState([]);
  const [resolvedTaxon, setResolvedTaxon] = useState(null);
  const [gbifCounts, setGbifCounts] = useState(() =>
    createEmptyRegionTaxonCountMap(EXTERNAL_REGIONS)
  );
  const [inatCounts, setInatCounts] = useState(() =>
    createEmptyRegionTaxonCountMap(EXTERNAL_REGIONS)
  );
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searching, setSearching] = useState(false);
  const [busyRegionId, setBusyRegionId] = useState(null);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const [sourcesLoading, setSourcesLoading] = useState(() => isExternalSourcesLoadActive());
  const searchAbortRef = useRef(null);

  const isInat = source === SOURCE_INAT;
  const isAll = source === SOURCE_ALL;
  const canSaveIntoCurrentLayer =
    Boolean(onSaveToRegionTempLayer) &&
    Array.isArray(focusRegions) &&
    focusRegions.length > 0;
  void datasetRevision;

  const selectSource = (next) => {
    setSource(next);
    setSearchStatus("idle");
    setResolvedTaxon(null);
    setResolvedTaxa([]);
  };

  const stopSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
    setSearchStatus((status) => (status === "loading" ? "idle" : status));
  }, []);

  const abortCountSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
  }, []);

  const handleClose = useCallback(() => {
    stopSearch();
    onClose?.();
  }, [onClose, stopSearch]);

  useEffect(() => {
    return subscribeExternalSourcesLoad((snap) => {
      setSourcesLoading(Boolean(snap?.gbif?.loading || snap?.inat?.loading));
    });
  }, []);

  useEffect(() => {
    if (open) {
      return undefined;
    }
    stopSearch();
    return undefined;
  }, [open, stopSearch]);

  const handleCancelLoad = useCallback(() => {
    cancelGbifExternalLoad();
    cancelInatExternalLoad();
  }, []);

  const gbifRegions = useMemo(() => {
    const list = Array.isArray(focusRegions) ? focusRegions : EXTERNAL_REGIONS;
    return list.filter((region) => Boolean(toGbifSpatialRegion(withLoadSpatialOverride(region, spatialByRegionId))));
  }, [focusRegions, spatialByRegionId]);
  const inatRegions = useMemo(() => {
    const list = Array.isArray(focusRegions) ? focusRegions : EXTERNAL_REGIONS;
    return list.filter((region) => Boolean(toInatSpatialRegion(withLoadSpatialOverride(region, spatialByRegionId))));
  }, [focusRegions, spatialByRegionId]);
  const catalogRegions = useMemo(() => {
    if (Array.isArray(focusRegions)) {
      return focusRegions;
    }
    return EXTERNAL_REGIONS;
  }, [focusRegions]);
  const availableRegions = isAll ? catalogRegions : isInat ? inatRegions : gbifRegions;

  const totalGbif = useMemo(
    () => sumRegionCounts(gbifCounts, gbifRegions),
    [gbifCounts, gbifRegions]
  );
  const totalInat = useMemo(
    () => sumRegionCounts(inatCounts, inatRegions),
    [inatCounts, inatRegions]
  );
  const totalCount = isAll
    ? null
    : isInat
      ? totalInat
      : totalGbif;

  const searchGbifDone = countSettledRegions(gbifCounts, gbifRegions);
  const searchInatDone = countSettledRegions(inatCounts, inatRegions);
  const searchCountsGbif = source === SOURCE_GBIF || source === SOURCE_ALL;
  const searchCountsInat = source === SOURCE_INAT || source === SOURCE_ALL;

  const runSearch = useCallback(async () => {
    const names = splitTaxonQueryNames(query);
    if (selectedSuggestions.length === 0 && names.length === 0) {
      onLoadError?.("Введите название таксона");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setSearchStatus("loading");
      setGbifCounts(createEmptyRegionTaxonCountMap(catalogRegions));
      setInatCounts(createEmptyRegionTaxonCountMap(catalogRegions));
    onLoadError?.(null);

    try {
      const selectedByName = new Map(
        selectedSuggestions.map((item) => [suggestionLabel(item).toLowerCase(), item])
      );
      const seeds = [];
      const seen = new Set();

      names.forEach((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        seeds.push(selectedByName.get(key) || { scientificName: name });
      });

      selectedSuggestions.forEach((item) => {
        const key = suggestionLabel(item).toLowerCase();
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        seeds.push(item);
      });

      const taxa = [];

      for (const item of seeds) {
        const hasKey = item?.taxonKey != null || item?.familyKey != null;
        const gbif = await resolveGbifLoadTaxon(
          {
            mode,
            suggestion: hasKey ? item : null,
            query: suggestionLabel(item) || item.scientificName || item.family || ""
          },
          { signal: controller.signal }
        );
        if (!gbif) {
          continue;
        }
        taxa.push(await attachInatTaxonId(gbif, { signal: controller.signal }));
      }

      if (!taxa.length) {
        throw new Error("Не удалось сопоставить таксон в GBIF");
      }

      if (controller.signal.aborted) {
        return;
      }

      if (source === SOURCE_INAT && taxa.every((taxon) => taxon.inatTaxonId == null)) {
        throw new Error(`Не найден taxon_id iNat для выбранных вариантов`);
      }

      const bundle = toBundleTaxon(taxa);
      setResolvedTaxa(taxa);
      setResolvedTaxon(bundle);
      setSearchStatus("ready");

      for (const taxon of taxa) {
        if (controller.signal.aborted) {
          return;
        }
        if (source === SOURCE_GBIF || source === SOURCE_ALL) {
          await fetchRegionTaxonCounts(
            gbifRegions.map((region) => withLoadSpatialOverride(region, spatialByRegionId)),
            {
            source: SOURCE_GBIF,
            extras: buildGbifLoadExtras(taxon),
            signal: controller.signal,
            onRegion: (regionId, preview) => {
              setGbifCounts((prev) => mergeCountPreview(prev, regionId, preview));
            }
          }
          );
        }
        if ((source === SOURCE_INAT || source === SOURCE_ALL) && taxon.inatTaxonId != null) {
          await fetchRegionTaxonCounts(
            inatRegions.map((region) => withLoadSpatialOverride(region, spatialByRegionId)),
            {
            source: SOURCE_INAT,
            extras: { taxon_id: taxon.inatTaxonId },
            signal: controller.signal,
            onRegion: (regionId, preview) => {
              setInatCounts((prev) => mergeCountPreview(prev, regionId, preview));
            }
          }
          );
        }
      }

      if (
        source === SOURCE_ALL &&
        taxa.every((taxon) => taxon.inatTaxonId == null) &&
        !controller.signal.aborted
      ) {
        onLoadError?.(`Таксон найден в GBIF, но не сопоставлен с iNat`);
      }

      if (!controller.signal.aborted) {
        setSearchStatus("ready");
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        return;
      }
      setResolvedTaxon(null);
      setResolvedTaxa([]);
      setSearchStatus("error");
      onLoadError?.(error?.message || "Не удалось выполнить поиск");
    } finally {
      if (searchAbortRef.current === controller) {
        setSearching(false);
      }
    }
  }, [catalogRegions, gbifRegions, inatRegions, mode, onLoadError, query, selectedSuggestions, source, spatialByRegionId]);

  const loadOneRegion = useCallback(
    async (region, sourceId) => {
      const taxa = resolvedTaxa.length ? resolvedTaxa : resolvedTaxon ? [resolvedTaxon] : [];
      if (!taxa.length) {
        throw new Error("Сначала выполните поиск таксона");
      }

      const bundleTaxon = toBundleTaxon(taxa);
      const bundleKey = taxaBundleKey(sourceId, taxa);
      const loadRegion = withLoadSpatialOverride(region, spatialByRegionId);

      if (sourceId === SOURCE_INAT && !toInatSpatialRegion(loadRegion)) {
        return;
      }
      if (sourceId !== SOURCE_INAT && !toGbifSpatialRegion(loadRegion)) {
        return;
      }

      for (const taxon of taxa) {
        if (sourceId === SOURCE_INAT) {
          if (taxon.inatTaxonId == null) {
            continue;
          }
          const extras = { taxon_id: taxon.inatTaxonId };
          const previewCount = inatCounts[region.id]?.count ?? null;
          const querySnapshot = {
            ...buildLoadQuery(region.id, taxon),
            qualityGrade: INAT_QUALITY_MODES.RESEARCH
          };
          await startInatExternalLoad({
            region: toInatSpatialRegion(loadRegion),
            kingdomId: querySnapshot.kingdomId || "",
            qualityGrade: INAT_QUALITY_MODES.RESEARCH,
            extras,
            query: querySnapshot,
            previewCount,
            intoTempStaging: true,
            taxon: bundleTaxon,
            bundleKey
          });
          continue;
        }

        await startGbifExternalLoad({
          region: toGbifSpatialRegion(loadRegion),
          kingdomId: taxon.kingdomId || "",
          extras: buildGbifLoadExtras(taxon),
          query: buildLoadQuery(region.id, taxon),
          previewCount: gbifCounts[region.id]?.count ?? null,
          intoTempStaging: true,
          taxon: bundleTaxon,
          bundleKey
        });
      }
    },
    [gbifCounts, inatCounts, resolvedTaxa, resolvedTaxon, spatialByRegionId]
  );

  const commitStagingIfAny = useCallback(() => {
    if (getTempLayerStagingCount() === 0) {
      return null;
    }
    return commitTempLayerStaging();
  }, []);

  const loadRegionsForSource = useCallback(
    async (sourceId, regions) => {
      for (const region of regions) {
        setBusyRegionId(region.id);
        await loadOneRegion(region, sourceId);
      }
    },
    [loadOneRegion]
  );

  const runRegionLoad = useCallback(
    async (region) => {
      if (!map || sourcesLoading || loading || busyRegionId) {
        return;
      }
      abortCountSearch();
      setBusyRegionId(region.id);
      onLoadError?.(null);
      try {
        if (isAll) {
          await loadOneRegion(region, SOURCE_GBIF);
          commitStagingIfAny();
          await loadOneRegion(region, SOURCE_INAT);
          commitStagingIfAny();
          await persistTempLayers();
          onTempLayersChange?.();
        } else {
          await loadOneRegion(region, isInat ? SOURCE_INAT : SOURCE_GBIF);
        }
        setDatasetRevision((value) => value + 1);
        onTempLayersChange?.();
      } catch (error) {
        onLoadError?.(error?.message || "Не удалось выполнить загрузку");
      } finally {
        setBusyRegionId(null);
      }
    },
    [abortCountSearch, busyRegionId, commitStagingIfAny, isAll, isInat, loadOneRegion, loading, map, onLoadError, onTempLayersChange, sourcesLoading]
  );

  const runLoadAll = useCallback(async () => {
    if (!map || sourcesLoading || loading || busyRegionId || !resolvedTaxon) {
      return;
    }
    abortCountSearch();
    onLoadError?.(null);
    try {
      if (isAll) {
        await loadRegionsForSource(SOURCE_GBIF, gbifRegions);
        commitStagingIfAny();
        await loadRegionsForSource(SOURCE_INAT, inatRegions);
        commitStagingIfAny();
        await persistTempLayers();
        onTempLayersChange?.();
      } else {
        await loadRegionsForSource(isInat ? SOURCE_INAT : SOURCE_GBIF, availableRegions);
      }
      setDatasetRevision((value) => value + 1);
      onTempLayersChange?.();
    } catch (error) {
      onLoadError?.(error?.message || "Не удалось выполнить загрузку");
      setDatasetRevision((value) => value + 1);
    } finally {
      setBusyRegionId(null);
    }
  }, [
    abortCountSearch,
    availableRegions,
    busyRegionId,
    commitStagingIfAny,
    gbifRegions,
    inatRegions,
    isAll,
    isInat,
    loadRegionsForSource,
    loading,
    map,
    onLoadError,
    onTempLayersChange,
    resolvedTaxon,
    sourcesLoading
  ]);

  const saveToTempLayer = useCallback(async (intoCurrentLayer = false) => {
    if (!map || sourcesLoading || loading || busyRegionId || !resolvedTaxon) {
      return;
    }
    abortCountSearch();

    const saveIntoCurrent = Boolean(intoCurrentLayer) && canSaveIntoCurrentLayer;

    onLoadError?.(null);
    try {
      if (isAll) {
        await loadRegionsForSource(SOURCE_GBIF, gbifRegions);
        if (saveIntoCurrent) {
          const gbifStaging = getTempLayerStaging();
          const gbifFeatures = [...(gbifStaging.features ?? [])];
          const gbifRegionIds = [...(gbifStaging.regionIds ?? [])];
          clearTempLayerStaging();
          await loadRegionsForSource(SOURCE_INAT, inatRegions);
          const inatStaging = getTempLayerStaging();
          const features = [...gbifFeatures, ...(inatStaging.features ?? [])];
          const regionIds = [...gbifRegionIds, ...(inatStaging.regionIds ?? [])];
          clearTempLayerStaging();
          if (features.length === 0) {
            onLoadError?.("Нет точек для временного слоя");
            return;
          }
          const ok = onSaveToRegionTempLayer(features, regionIds);
          if (!ok) {
            onLoadError?.("Не удалось сохранить точки в слой регионов");
            return;
          }
        } else {
          const gbifLayer = commitStagingIfAny();
          await loadRegionsForSource(SOURCE_INAT, inatRegions);
          const inatLayer = commitStagingIfAny();
          if (!gbifLayer && !inatLayer) {
            onLoadError?.("Нет точек для временного слоя");
            return;
          }
        }
      } else {
        await loadRegionsForSource(isInat ? SOURCE_INAT : SOURCE_GBIF, availableRegions);
        setDatasetRevision((value) => value + 1);
        if (getTempLayerStagingCount() === 0) {
          onLoadError?.("Нет точек для временного слоя");
          return;
        }
        if (saveIntoCurrent) {
          const staging = getTempLayerStaging();
          const ok = onSaveToRegionTempLayer(staging.features, staging.regionIds);
          clearTempLayerStaging();
          if (!ok) {
            onLoadError?.("Не удалось сохранить точки в слой регионов");
            return;
          }
        } else {
          commitTempLayerStaging();
        }
      }
      setDatasetRevision((value) => value + 1);
      await persistTempLayers();
      onTempLayersChange?.();
    } catch (error) {
      setDatasetRevision((value) => value + 1);
      onLoadError?.(error?.message || "Не удалось сохранить временный слой");
    } finally {
      setBusyRegionId(null);
    }
  }, [
    abortCountSearch,
    availableRegions,
    busyRegionId,
    commitStagingIfAny,
    gbifRegions,
    inatRegions,
    isAll,
    isInat,
    loadRegionsForSource,
    loading,
    map,
    onLoadError,
    onSaveToRegionTempLayer,
    onTempLayersChange,
    resolvedTaxon,
    canSaveIntoCurrentLayer,
    sourcesLoading
  ]);

  if (!open) {
    return null;
  }

  const seriesLabel =
    loadSnapshot?.gbif?.seriesLabel || loadSnapshot?.inat?.seriesLabel || null;
  const showTable = searchStatus === "ready" || searchStatus === "loading";
  const loadBusy = Boolean(busyRegionId) || sourcesLoading || loading;
  const canLoad =
    Boolean(map) && Boolean(resolvedTaxon) && searchStatus === "ready" && !loadBusy;

  return (
    <div className="regions-load-overlay" onClick={handleClose}>
      <div
        className={
          showTable
            ? "regions-load-dialog selective-load-dialog selective-load-dialog--results"
            : "regions-load-dialog selective-load-dialog"
        }
        role="dialog"
        aria-modal="true"
        aria-label="Выборочная загрузка"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="regions-load-close"
          onClick={handleClose}
          aria-label="Закрыть"
          title="Закрыть"
        >
          ×
        </button>
        <h3 className="regions-load-title">Выборочная загрузка</h3>
        {Array.isArray(focusRegions) && focusRegions.length > 0 ? (
          <PanelHint>
            Фильтр регионов включён: {focusRegions.length} субъект(ов) с карты.
            {canSaveIntoCurrentLayer
              ? " Точки можно сохранить в текущий слой выделенных регионов или в новый временный слой."
              : ""}
            {unmatchedLabels.length > 0
              ? ` Не сопоставлены: ${unmatchedLabels.join(", ")}.`
              : ""}
          </PanelHint>
        ) : null}

        <div className="selective-load-toolbar">
          <TaxonLoadPicker
            mode={mode}
            query={query}
            onModeChange={(next) => {
              setMode(next);
              setSearchStatus("idle");
              setResolvedTaxon(null);
              setResolvedTaxa([]);
              setSelectedSuggestions([]);
            }}
            onQueryChange={(next) => {
              setQuery(next);
              setSearchStatus("idle");
              setResolvedTaxon(null);
              setResolvedTaxa([]);
            }}
            selectedSuggestions={selectedSuggestions}
            onSelectedSuggestionsChange={setSelectedSuggestions}
            searchPrefix={
          <div className="regions-load-source-tabs" role="tablist" aria-label="Источник данных">
            <button
              type="button"
              role="tab"
              aria-selected={source === SOURCE_GBIF}
              className={
                source === SOURCE_GBIF
                  ? "regions-load-source-tab regions-load-source-tab--active"
                  : "regions-load-source-tab"
              }
              onClick={() => selectSource(SOURCE_GBIF)}
            >
              GBIF
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === SOURCE_INAT}
              className={
                source === SOURCE_INAT
                  ? "regions-load-source-tab regions-load-source-tab--active"
                  : "regions-load-source-tab"
              }
              onClick={() => selectSource(SOURCE_INAT)}
            >
              iNat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === SOURCE_ALL}
              className={
                source === SOURCE_ALL
                  ? "regions-load-source-tab regions-load-source-tab--active"
                  : "regions-load-source-tab"
              }
              onClick={() => selectSource(SOURCE_ALL)}
            >
              Все
            </button>
          </div>
            }
            searchAction={
            <button
              type="button"
              className="gbif-panel-btn selective-load-search-btn"
              disabled={
                searching ||
                (splitTaxonQueryNames(query).every((name) => name.length < 2) &&
                  selectedSuggestions.length === 0)
              }
              aria-label={searching ? "Идёт поиск" : "Поиск"}
              title={searching ? "Идёт поиск" : "Поиск"}
              aria-busy={searching}
              onClick={runSearch}
            >
              {searching ? (
                <span className="selective-load-search-btn-spinner" aria-hidden="true" />
              ) : (
                <SearchIcon className="regions-load-action-icon" aria-hidden="true" focusable="false" />
              )}
            </button>
            }
          />
        </div>

        {resolvedTaxon ? (
          <p className="regions-load-hint">
            {resolvedTaxa.length > 1
              ? resolvedTaxa.map((taxon) => taxon.scientificName).join(" · ")
              : resolvedTaxon.scientificName}
            {resolvedTaxa.length === 1 && resolvedTaxon.inatTaxonId != null
              ? ` · iNat ${resolvedTaxon.inatTaxonId}`
              : ""}
          </p>
        ) : (
          <PanelHint>
            Выберите источник загрузки, уровень (вид, род...). Отметьте галочками варианты, которые нужно загрузить в один временный слой.
            {isAll ? " в GBIF и iNat" : ""}.
          </PanelHint>
        )}

        {searching ? (
          <div className="selective-load-search-status" role="status" aria-live="polite">
            <span className="selective-load-search-btn-spinner" aria-hidden="true" />
            <div className="selective-load-search-status-text">
              <p className="selective-load-search-status-title">Идёт поиск</p>
              <p className="selective-load-search-status-detail">
                {!resolvedTaxon
                  ? "Сопоставляем таксон в GBIF…"
                  : searchCountsGbif && searchCountsInat
                    ? `Считаем точки по регионам · GBIF ${searchGbifDone} из ${gbifRegions.length} · iNat ${searchInatDone} из ${inatRegions.length}`
                    : searchCountsInat
                      ? `Считаем точки по регионам · ${searchInatDone} из ${inatRegions.length}`
                      : `Считаем точки по регионам · ${searchGbifDone} из ${gbifRegions.length}`}
              </p>
            </div>
            <button
              type="button"
              className="gbif-panel-btn gbif-panel-btn--secondary"
              onClick={() => {
                if (resolvedTaxon) {
                  abortCountSearch();
                  return;
                }
                stopSearch();
              }}
            >
              Отменить поиск
            </button>
          </div>
        ) : null}

        {loading || sourcesLoading ? (
          <div className="regions-load-progress">
            <p className="regions-load-progress-text">
              Идёт загрузка
              {loadSnapshot?.gbif?.loading ? " GBIF" : ""}
              {loadSnapshot?.gbif?.loading && loadSnapshot?.inat?.loading ? " и" : ""}
              {loadSnapshot?.inat?.loading ? " iNat" : ""}
              …
              {seriesLabel ? ` (${seriesLabel})` : ""}
            </p>
            {loadSnapshot?.gbif?.loading ? (
              <p className="regions-load-progress-counts">
                GBIF: {formatCount(loadSnapshot.gbif.fetched)}
                {typeof loadSnapshot.gbif.total === "number"
                  ? ` из ${formatCount(loadSnapshot.gbif.total)}`
                  : " получено"}
              </p>
            ) : null}
            {loadSnapshot?.inat?.loading ? (
              <p className="regions-load-progress-counts">
                iNat: {formatCount(loadSnapshot.inat.fetched)}
                {typeof loadSnapshot.inat.total === "number"
                  ? ` из ${formatCount(loadSnapshot.inat.total)}`
                  : " получено"}
              </p>
            ) : null}
            <button
              type="button"
              className="gbif-panel-btn gbif-panel-btn--secondary"
              onClick={handleCancelLoad}
            >
              Отменить загрузку
            </button>
          </div>
        ) : null}

        {loadError ? <p className="regions-load-error">{loadError}</p> : null}

        {showTable ? (
          <div className="regions-load-table-wrap">
            <div className="regions-load-table-scroll">
              <table className="regions-load-table">
                <thead>
                  <tr>
                    <th scope="col">Регион</th>
                    {isAll ? (
                      <>
                        <th scope="col">GBIF</th>
                        <th scope="col">iNat</th>
                      </>
                    ) : (
                      <th scope="col">Точек</th>
                    )}
                    <th scope="col">Загрузить</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRegions.map((region) => {
                    const gbifPreview = gbifCounts[region.id];
                    const inatPreview = inatCounts[region.id];
                    const hasGbif = Boolean(toGbifSpatialRegion(withLoadSpatialOverride(region, spatialByRegionId)));
                    const hasInat = Boolean(toInatSpatialRegion(withLoadSpatialOverride(region, spatialByRegionId)));
                    const hasSpatial = isAll
                      ? hasGbif || hasInat
                      : isInat
                        ? hasInat
                        : hasGbif;
                    const preview = isInat ? inatPreview : gbifPreview;
                    const unavailable = isAll
                      ? false
                      : preview?.status === "unavailable";
                    const rowBusy = busyRegionId === region.id;

                    return (
                      <tr key={region.id}>
                        <th scope="row">{region.label}</th>
                        {isAll ? (
                          <>
                            <td className="regions-load-table-num">
                              {previewCellText(gbifPreview, hasGbif)}
                            </td>
                            <td className="regions-load-table-num">
                              {previewCellText(inatPreview, hasInat)}
                            </td>
                          </>
                        ) : (
                          <td className="regions-load-table-num">
                            {previewCellText(preview, hasSpatial)}
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="gbif-panel-btn regions-load-action-btn"
                            disabled={!canLoad || unavailable || !hasSpatial || rowBusy}
                            aria-label={`Загрузить ${region.label}`}
                            title="Загрузить"
                            onClick={() => runRegionLoad(region)}
                          >
                            {rowBusy ? (
                              <span className="regions-load-action-busy" aria-hidden="true">
                                …
                              </span>
                            ) : (
                              <DownloadIcon className="regions-load-action-icon" aria-hidden="true" focusable="false" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="selective-load-footer">
              <span className="selective-load-footer-total">
                {isAll
                  ? `Всего: GBIF ${formatCount(totalGbif)} · iNat ${formatCount(totalInat)}`
                  : `Всего точек: ${formatCount(totalCount)}`}
                {getTempLayerStagingCount() > 0
                  ? ` · в сессии: ${formatCount(getTempLayerStagingCount())}`
                  : ""}
              </span>
              <div className="selective-load-footer-actions">
                {canSaveIntoCurrentLayer ? (
                  <>
                    <button
                      type="button"
                      className="gbif-panel-btn gbif-panel-btn--secondary"
                      disabled={!canLoad || availableRegions.length === 0}
                      onClick={() => saveToTempLayer(true)}
                      title="Сохранить найденные точки в тот же временный слой, что и выделенные на карте регионы"
                    >
                      В текущий слой
                    </button>
                    <button
                      type="button"
                      className="gbif-panel-btn gbif-panel-btn--secondary"
                      disabled={!canLoad || availableRegions.length === 0}
                      onClick={() => saveToTempLayer(false)}
                      title="Сохранить найденные точки в новый временный слой"
                    >
                      В новый слой
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="gbif-panel-btn gbif-panel-btn--secondary"
                    disabled={!canLoad || availableRegions.length === 0}
                    onClick={() => saveToTempLayer(false)}
                  >
                    Во временный слой
                  </button>
                )}
                <button
                  type="button"
                  className="gbif-panel-btn"
                  disabled={!canLoad || availableRegions.length === 0}
                  onClick={runLoadAll}
                >
                  Загрузить все
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
