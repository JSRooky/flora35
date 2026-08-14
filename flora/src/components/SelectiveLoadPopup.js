import React, { useCallback, useMemo, useRef, useState } from "react";
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
  cancelInatExternalLoad
} from "../externalSources/externalSourcesLoadManager";
import {
  EXTERNAL_REGIONS,
  toGbifSpatialRegion,
  toInatSpatialRegion
} from "../externalSources/regions";
import {
  createEmptyRegionTaxonCountMap,
  fetchRegionTaxonCounts
} from "../externalSources/fetchRegionKingdomPreviews";
import TaxonLoadPicker from "./TaxonLoadPicker";
import {
  getTempLayerStagingCount,
  commitTempLayerStaging
} from "../tempLayers/tempLayerStore";
import { persistTempLayers } from "../tempLayers/tempLayerPersistence";

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Number(value));
}

function DownloadIcon({ className = "regions-load-action-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor" />
    </svg>
  );
}

function SearchIcon({ className = "regions-load-action-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        fill="currentColor"
      />
    </svg>
  );
}

function buildLoadQuery(regionId, taxon) {
  return {
    regionId,
    kingdomId: taxon?.kingdomId ?? null,
    kingdomIds: taxon?.kingdomId ? [taxon.kingdomId] : null,
    ...taxonQueryFields(taxon)
  };
}

export default function SelectiveLoadPopup({
  open = false,
  map = null,
  loading = false,
  loadSnapshot = null,
  loadError = null,
  onClose,
  onLoadError,
  onTempLayersChange
}) {
  const [source, setSource] = useState("gbif");
  const [mode, setMode] = useState(TAXON_LOAD_MODES.SPECIES);
  const [query, setQuery] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [resolvedTaxon, setResolvedTaxon] = useState(null);
  const [counts, setCounts] = useState(() => createEmptyRegionTaxonCountMap(EXTERNAL_REGIONS));
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searching, setSearching] = useState(false);
  const [busyRegionId, setBusyRegionId] = useState(null);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const searchAbortRef = useRef(null);

  const isInat = source === "inat";
  void datasetRevision;

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleCancelLoad = useCallback(() => {
    cancelGbifExternalLoad();
    cancelInatExternalLoad();
  }, []);

  const availableRegions = useMemo(
    () =>
      EXTERNAL_REGIONS.filter((region) =>
        isInat ? Boolean(toInatSpatialRegion(region)) : Boolean(toGbifSpatialRegion(region))
      ),
    [isInat]
  );

  const totalCount = useMemo(() => {
    let sum = 0;
    let any = false;
    availableRegions.forEach((region) => {
      const value = counts[region.id]?.count;
      if (typeof value === "number") {
        sum += value;
        any = true;
      }
    });
    return any ? sum : null;
  }, [availableRegions, counts]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      onLoadError?.("Введите название таксона");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setSearchStatus("loading");
    setCounts(createEmptyRegionTaxonCountMap(EXTERNAL_REGIONS));
    onLoadError?.(null);

    try {
      const gbif = await resolveGbifLoadTaxon(
        { mode, suggestion, query: q },
        { signal: controller.signal }
      );
      if (!gbif) {
        throw new Error("Не удалось сопоставить таксон в GBIF");
      }

      const taxon = await attachInatTaxonId(gbif, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }

      if (source === "inat" && taxon.inatTaxonId == null) {
        throw new Error(`Не найден taxon_id iNaturalist для «${taxon.scientificName}»`);
      }

      setResolvedTaxon(taxon);

      const extras =
        source === "inat"
          ? { taxon_id: taxon.inatTaxonId }
          : buildGbifLoadExtras(taxon);

      await fetchRegionTaxonCounts(EXTERNAL_REGIONS, {
        source,
        extras,
        signal: controller.signal,
        onRegion: (regionId, preview) => {
          setCounts((prev) => ({ ...prev, [regionId]: preview }));
        }
      });

      if (!controller.signal.aborted) {
        setSearchStatus("ready");
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        return;
      }
      setResolvedTaxon(null);
      setSearchStatus("error");
      onLoadError?.(error?.message || "Не удалось выполнить поиск");
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, [mode, onLoadError, query, source, suggestion]);

  const loadOneRegion = useCallback(
    async (region) => {
      const taxon = resolvedTaxon;
      if (!taxon) {
        throw new Error("Сначала выполните поиск таксона");
      }

      if (source === "inat") {
        const inatRegion = toInatSpatialRegion(region);
        if (!inatRegion) {
          throw new Error(`У региона «${region.label}» нет placeId iNaturalist`);
        }
        const extras = { taxon_id: taxon.inatTaxonId };
        const previewCount = counts[region.id]?.count ?? null;
        const querySnapshot = {
          ...buildLoadQuery(region.id, taxon),
          qualityGrade: INAT_QUALITY_MODES.RESEARCH
        };
        await startInatExternalLoad({
          region: inatRegion,
          kingdomId: querySnapshot.kingdomId || "",
          qualityGrade: INAT_QUALITY_MODES.RESEARCH,
          extras,
          query: querySnapshot,
          previewCount,
          intoTempStaging: true,
          taxon
        });
        return;
      }

      const gbifRegion = toGbifSpatialRegion(region);
      if (!gbifRegion) {
        throw new Error(`У региона «${region.label}» нет GADM-идентификатора`);
      }
      const extras = buildGbifLoadExtras(taxon);
      await startGbifExternalLoad({
        region: gbifRegion,
        kingdomId: taxon.kingdomId || "",
        extras,
        query: buildLoadQuery(region.id, taxon),
        previewCount: counts[region.id]?.count ?? null,
        intoTempStaging: true,
        taxon
      });
    },
    [counts, resolvedTaxon, source]
  );

  const runRegionLoad = useCallback(
    async (region) => {
      if (!map || isExternalSourcesLoadActive() || busyRegionId) {
        return;
      }
      setBusyRegionId(region.id);
      onLoadError?.(null);
      try {
        await loadOneRegion(region);
        setDatasetRevision((value) => value + 1);
      } catch (error) {
        onLoadError?.(error?.message || "Не удалось выполнить загрузку");
      } finally {
        setBusyRegionId(null);
      }
    },
    [busyRegionId, loadOneRegion, map, onLoadError]
  );

  const runLoadAll = useCallback(async () => {
    if (!map || isExternalSourcesLoadActive() || busyRegionId || !resolvedTaxon) {
      return;
    }
    onLoadError?.(null);
    try {
      for (const region of availableRegions) {
        setBusyRegionId(region.id);
        await loadOneRegion(region);
      }
      setDatasetRevision((value) => value + 1);
    } catch (error) {
      onLoadError?.(error?.message || "Не удалось выполнить загрузку");
      setDatasetRevision((value) => value + 1);
    } finally {
      setBusyRegionId(null);
    }
  }, [availableRegions, busyRegionId, loadOneRegion, map, onLoadError, resolvedTaxon]);

  const saveToTempLayer = useCallback(async () => {
    if (!map || isExternalSourcesLoadActive() || busyRegionId || !resolvedTaxon) {
      return;
    }

    onLoadError?.(null);
    try {
      for (const region of availableRegions) {
        setBusyRegionId(region.id);
        await loadOneRegion(region);
      }
      setDatasetRevision((value) => value + 1);

      if (getTempLayerStagingCount() === 0) {
        onLoadError?.("Нет точек для временного слоя");
        return;
      }

      commitTempLayerStaging();
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
    availableRegions,
    busyRegionId,
    loadOneRegion,
    map,
    onLoadError,
    onTempLayersChange,
    resolvedTaxon
  ]);

  if (!open) {
    return null;
  }

  const seriesLabel =
    loadSnapshot?.gbif?.seriesLabel || loadSnapshot?.inat?.seriesLabel || null;
  const showTable = searchStatus === "ready" || searchStatus === "loading";
  const canLoad =
    Boolean(map) &&
    Boolean(resolvedTaxon) &&
    searchStatus === "ready" &&
    !busyRegionId &&
    !isExternalSourcesLoadActive();

  return (
    <div className="regions-load-overlay" onClick={handleClose}>
      <div
        className="regions-load-dialog selective-load-dialog"
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

        <div className="selective-load-toolbar">
          <div className="regions-load-source-tabs" role="tablist" aria-label="Источник данных">
            <button
              type="button"
              role="tab"
              aria-selected={source === "gbif"}
              className={
                source === "gbif"
                  ? "regions-load-source-tab regions-load-source-tab--active"
                  : "regions-load-source-tab"
              }
              onClick={() => {
                setSource("gbif");
                setSearchStatus("idle");
                setResolvedTaxon(null);
              }}
            >
              GBIF
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === "inat"}
              className={
                source === "inat"
                  ? "regions-load-source-tab regions-load-source-tab--active"
                  : "regions-load-source-tab"
              }
              onClick={() => {
                setSource("inat");
                setSearchStatus("idle");
                setResolvedTaxon(null);
              }}
            >
              iNaturalist
            </button>
          </div>

          <TaxonLoadPicker
            mode={mode}
            query={query}
            onModeChange={(next) => {
              setMode(next);
              setSearchStatus("idle");
              setResolvedTaxon(null);
            }}
            onQueryChange={(next) => {
              setQuery(next);
              setSearchStatus("idle");
              setResolvedTaxon(null);
            }}
            onSuggestionChange={setSuggestion}
          />

          <button
            type="button"
            className="gbif-panel-btn selective-load-search-btn"
            disabled={searching || query.trim().length < 2}
            aria-label="Поиск"
            title="Поиск"
            onClick={runSearch}
          >
            {searching ? <span aria-hidden="true">…</span> : <SearchIcon />}
          </button>
        </div>

        {resolvedTaxon ? (
          <p className="regions-load-hint">
            {resolvedTaxon.scientificName}
            {resolvedTaxon.inatTaxonId != null ? ` · iNat ${resolvedTaxon.inatTaxonId}` : ""}
          </p>
        ) : (
          <p className="regions-load-hint">
            Выберите вид, род или семейство и нажмите поиск — появится число точек по регионам.
          </p>
        )}

        {loading ? (
          <div className="regions-load-progress">
            <p className="regions-load-progress-text">
              Идёт загрузка
              {loadSnapshot?.gbif?.loading ? " GBIF" : ""}
              {loadSnapshot?.gbif?.loading && loadSnapshot?.inat?.loading ? " и" : ""}
              {loadSnapshot?.inat?.loading ? " iNaturalist" : ""}
              …
              {seriesLabel ? ` (${seriesLabel})` : ""}
            </p>
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
                    <th scope="col">Точек</th>
                    <th scope="col">Загрузить</th>
                  </tr>
                </thead>
                <tbody>
                  {EXTERNAL_REGIONS.map((region) => {
                    const preview = counts[region.id];
                    const unavailable = preview?.status === "unavailable";
                    const hasSpatial = isInat
                      ? Boolean(toInatSpatialRegion(region))
                      : Boolean(toGbifSpatialRegion(region));
                    const rowBusy = busyRegionId === region.id;
                    const cellText =
                      unavailable || !hasSpatial
                        ? "—"
                        : preview?.status === "loading"
                          ? "…"
                          : formatCount(preview?.count);

                    return (
                      <tr key={region.id}>
                        <th scope="row">{region.label}</th>
                        <td className="regions-load-table-num">{cellText}</td>
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
                              <DownloadIcon />
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
                Всего точек: {formatCount(totalCount)}
                {getTempLayerStagingCount() > 0
                  ? ` · в сессии: ${formatCount(getTempLayerStagingCount())}`
                  : ""}
              </span>
              <div className="selective-load-footer-actions">
                <button
                  type="button"
                  className="gbif-panel-btn gbif-panel-btn--secondary"
                  disabled={!canLoad || availableRegions.length === 0}
                  onClick={saveToTempLayer}
                >
                  Во временный слой
                </button>
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
