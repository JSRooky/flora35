import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewOccurrenceCount, withUpdateSinceExtras } from "../gbif/gbifClient";
import {
  getGbifLoadedQuery,
  getGbifLoadedRegionIds,
  getGbifSyncedAt
} from "../gbif/gbifStore";
import { GBIF_KINGDOMS, buildTaxonSearchExtras } from "../gbif/taxonFilters";
import {
  INAT_QUALITY_MODES,
  previewObservationCount,
  withInatUpdateSinceExtras
} from "../inaturalist/inatClient";
import {
  getInatLoadedQuery,
  getInatLoadedRegionIds,
  getInatSyncedAt
} from "../inaturalist/inatStore";
import {
  isExternalSourcesLoadActive,
  startGbifExternalLoad,
  startInatExternalLoad,
  clearGbifExternalDataset,
  clearInatExternalDataset
} from "../externalSources/externalSourcesLoadManager";
import {
  EXTERNAL_REGIONS,
  toGbifSpatialRegion,
  toInatSpatialRegion
} from "../externalSources/regions";
import { withLoadSpatialOverride } from "../externalSources/bufferedSpatialRegion";
import {
  AVG_EXTERNAL_FEATURE_BYTES,
  KINGDOM_TO_INAT_ICONIC,
  createEmptyRegionPreviewMap,
  fetchRegionKingdomPreviews
} from "../externalSources/fetchRegionKingdomPreviews";
import { DownloadIcon, RefreshIcon, TrashIcon } from "../images/buttons";
import LoadDestinationSelect, {
  LOAD_LAYER_DEST,
  finalizeLoadDestination,
  isExternalLoadDestination
} from "./LoadDestinationSelect";
import { getTempLayerLoadBlockMessage } from "../tempLayers/tempLayerStore";
import { estimateTempGeoJsonBytes, formatTempDataSize } from "../tempLayers/tempLayerMemory";
import { resolveReusableExternalLoad } from "../externalSources/reuseLoadedFeatures";

const KINGDOM_SHORT_LABELS = {
  plantae: "Раст.",
  animalia: "Жив.",
  fungi: "Грибы",
  protozoa: "Прост."
};

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Number(value));
}

function formatMegabytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    return `${mb.toFixed(2)} МБ`;
  }
  return `${mb.toFixed(1)} МБ`;
}

/** Пустой выбор = все царства. */
function resolveSelectedCount(preview, kingdomIds) {
  if (!preview) {
    return null;
  }
  const selected = Array.isArray(kingdomIds) ? kingdomIds : [];
  if (selected.length === 0) {
    return preview.total;
  }

  let sum = 0;
  let any = false;
  for (const id of selected) {
    const value = preview[id];
    if (typeof value === "number") {
      sum += value;
      any = true;
    }
  }
  return any ? sum : null;
}

function resolveSelectedBytes(preview, kingdomIds) {
  if (!preview || preview.status === "unavailable") {
    return null;
  }
  const selectedCount = resolveSelectedCount(preview, kingdomIds);
  if (selectedCount != null) {
    return selectedCount * AVG_EXTERNAL_FEATURE_BYTES;
  }
  return typeof preview.bytes === "number" ? preview.bytes : null;
}

function buildInatExtras(kingdomIds) {
  const selected = Array.isArray(kingdomIds) ? kingdomIds : [];
  if (selected.length === 0) {
    return {};
  }

  const iconic = selected
    .map((id) => KINGDOM_TO_INAT_ICONIC[id])
    .filter(Boolean);

  if (iconic.length === 0) {
    return {};
  }

  return { iconicTaxa: iconic.length === 1 ? iconic[0] : iconic };
}

function buildLoadQuery(regionId, kingdomIds) {
  const selected = Array.isArray(kingdomIds) ? kingdomIds : [];
  return {
    regionId,
    kingdomId: selected.length === 1 ? selected[0] : null,
    kingdomIds: selected.length > 0 ? selected : null
  };
}

function formatLoadedKingdoms(query) {
  if (!query) {
    return "";
  }
  if (Array.isArray(query.kingdomIds) && query.kingdomIds.length > 0) {
    return query.kingdomIds.join(", ");
  }
  return query.kingdomId || "";
}

/**
 * Таблица регионов России: превью по царствам, объём, загрузка / обновление.
 * Источник переключается: GBIF | iNaturalist.
 * Царства выбираются кликом по ячейкам со счётчиками (можно несколько).
 */
export default function RegionsLoadTable({
  map = null,
  onLoadError,
  regions = null,
  spatialByRegionId = null,
  onTempLayersChange
}) {
  const regionList = Array.isArray(regions) ? regions : EXTERNAL_REGIONS;
  const previewRegions = useMemo(
    () => regionList.map((region) => withLoadSpatialOverride(region, spatialByRegionId)),
    [regionList, spatialByRegionId]
  );
  const [source, setSource] = useState("gbif");
  const [previews, setPreviews] = useState(() =>
    createEmptyRegionPreviewMap(previewRegions)
  );
  const [kingdomsByRegion, setKingdomsByRegion] = useState(() => {
    const initial = {};
    previewRegions.forEach((region) => {
      initial[region.id] = [];
    });
    return initial;
  });
  const [filter, setFilter] = useState("");
  const [busyRegionId, setBusyRegionId] = useState(null);
  const [datasetRevision, setDatasetRevision] = useState(0);
  const [previewStatus, setPreviewStatus] = useState("loading");
  const [destination, setDestination] = useState(LOAD_LAYER_DEST.EXTERNAL);
  const createdPlaqueKeyRef = useRef("");
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewStatus("loading");
    setPreviews(createEmptyRegionPreviewMap(previewRegions));

    fetchRegionKingdomPreviews(previewRegions, {
      source,
      signal: controller.signal,
      onRegion: (regionId, preview) => {
        setPreviews((prev) => ({ ...prev, [regionId]: preview }));
      }
    })
      .then(() => {
        if (!controller.signal.aborted) {
          setPreviewStatus("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreviewStatus("error");
        }
      });

    return () => {
      controller.abort();
    };
  }, [previewRegions, source]);

  const filteredRegions = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return regionList;
    }
    return regionList.filter(
      (region) =>
        region.label.toLowerCase().includes(query) ||
        region.labelEn?.toLowerCase().includes(query) ||
        region.id.includes(query)
    );
  }, [filter, regionList]);

  const isInat = source === "inat";
  const intoTempStaging = !isExternalLoadDestination(destination);
  // Перечитываем store после загрузки/удаления.
  void datasetRevision;
  const loadedQuery = isInat ? getInatLoadedQuery() : getGbifLoadedQuery();
  const loadedRegionIds = isInat ? getInatLoadedRegionIds() : getGbifLoadedRegionIds();
  const loadedKingdomsLabel = formatLoadedKingdoms(loadedQuery);
  const syncedAt = isInat ? getInatSyncedAt() : getGbifSyncedAt();

  useEffect(() => {
    createdPlaqueKeyRef.current = "";
  }, [destination, source]);

  const commitLoadedPoints = useCallback(async () => {
    if (!intoTempStaging) {
      return;
    }
    const layer = await finalizeLoadDestination(destination, onTempLayersChange, {
      forceNew: true,
      plaqueKey: createdPlaqueKeyRef.current
    });
    if (layer?.groupKey) {
      createdPlaqueKeyRef.current = layer.groupKey;
    }
  }, [destination, intoTempStaging, onTempLayersChange]);

  const toggleKingdom = useCallback((regionId, kingdomId) => {
    setKingdomsByRegion((prev) => {
      const current = Array.isArray(prev[regionId]) ? prev[regionId] : [];
      const next = current.includes(kingdomId)
        ? current.filter((id) => id !== kingdomId)
        : [...current, kingdomId];
      return { ...prev, [regionId]: next };
    });
  }, []);

  const isRegionAvailable = useCallback(
    (region) => {
      if (isInat) {
        return Boolean(toInatSpatialRegion(region));
      }
      return Boolean(toGbifSpatialRegion(region));
    },
    [isInat]
  );

  const availableFilteredRegions = useMemo(
    () => filteredRegions.filter(isRegionAvailable),
    [filteredRegions, isRegionAvailable]
  );

  const columnTotals = useMemo(() => {
    const kingdomSums = {};
    for (const kingdom of GBIF_KINGDOMS) {
      kingdomSums[kingdom.id] = { sum: 0, any: false };
    }

    let bytesSum = 0;
    let bytesAny = false;

    for (const region of filteredRegions) {
      if (!isRegionAvailable(region)) {
        continue;
      }

      const preview = previews[region.id];
      if (!preview || preview.status === "unavailable") {
        continue;
      }

      for (const kingdom of GBIF_KINGDOMS) {
        const value = preview[kingdom.id];
        if (typeof value === "number") {
          kingdomSums[kingdom.id].sum += value;
          kingdomSums[kingdom.id].any = true;
        }
      }

      const bytes = resolveSelectedBytes(
        preview,
        kingdomsByRegion[region.id] || []
      );
      if (bytes != null) {
        bytesSum += bytes;
        bytesAny = true;
      }
    }

    const kingdomTotals = {};
    for (const kingdom of GBIF_KINGDOMS) {
      const entry = kingdomSums[kingdom.id];
      kingdomTotals[kingdom.id] = entry.any ? entry.sum : null;
    }

    return {
      kingdomTotals,
      totalEstimatedBytes: bytesAny ? bytesSum : null
    };
  }, [filteredRegions, isRegionAvailable, previews, kingdomsByRegion]);

  const kingdomTotals = columnTotals.kingdomTotals;
  const totalEstimatedBytes = columnTotals.totalEstimatedBytes;

  const loadOneRegion = useCallback(
    async (region, { incremental }) => {
      const kingdomIds = kingdomsByRegion[region.id] || [];
      const loadRegion = withLoadSpatialOverride(region, spatialByRegionId);
      const selectedCount = resolveSelectedCount(previews[region.id], kingdomIds);
      const query = buildLoadQuery(region.id, kingdomIds);
      if (intoTempStaging && !incremental) {
        const reuse = resolveReusableExternalLoad({
          source: source === "inat" ? "inat" : "gbif",
          region: loadRegion,
          kingdomId: query.kingdomId || "",
          query,
          extras: {}
        });
        if (reuse.mode !== "reuse") {
          const incoming = typeof selectedCount === "number" ? selectedCount : 0;
          const blocked = getTempLayerLoadBlockMessage(incoming);
          if (blocked && incoming > 0) {
            throw new Error(blocked);
          }
        }
      }

      if (source === "inat") {
        const inatRegion = toInatSpatialRegion(loadRegion);
        if (!inatRegion) {
          throw new Error(`У региона «${region.label}» нет placeId iNaturalist`);
        }

        const inatExtras = buildInatExtras(kingdomIds);
        let extras = inatExtras;
        if (incremental && syncedAt) {
          extras = withInatUpdateSinceExtras(inatExtras, syncedAt);
        }

        let previewCount = incremental ? null : selectedCount;
        if (incremental && selectedCount == null) {
          previewCount = await previewObservationCount(inatRegion, {
            qualityGrade: INAT_QUALITY_MODES.RESEARCH,
            extras
          });
        }

        const inatQuery = {
          ...query,
          qualityGrade: INAT_QUALITY_MODES.RESEARCH
        };

        await startInatExternalLoad({
          region: inatRegion,
          kingdomId: inatQuery.kingdomId || "",
          qualityGrade: INAT_QUALITY_MODES.RESEARCH,
          extras,
          query: inatQuery,
          previewCount,
          intoTempStaging
        });
        return;
      }

      const gbifRegion = toGbifSpatialRegion(loadRegion);
      if (!gbifRegion) {
        throw new Error(`У региона «${region.label}» нет GADM-идентификатора`);
      }

      const loadTargets = kingdomIds.length > 0 ? kingdomIds : [null];

      for (let index = 0; index < loadTargets.length; index += 1) {
        const kingdomId = loadTargets[index];
        const gbifExtras = buildTaxonSearchExtras({
          kingdomId: kingdomId || null
        });
        let extras = { ...gbifExtras };
        if (incremental && syncedAt) {
          extras = withUpdateSinceExtras(gbifExtras, syncedAt);
        }

        const partCount =
          kingdomId == null
            ? selectedCount
            : typeof previews[region.id]?.[kingdomId] === "number"
              ? previews[region.id][kingdomId]
              : null;

        let previewCount = incremental ? null : partCount;
        if (incremental && partCount == null) {
          previewCount = await previewOccurrenceCount(gbifRegion, { extras });
        }

        await startGbifExternalLoad({
          region: gbifRegion,
          kingdomId: kingdomId || "",
          extras,
          query,
          previewCount,
          intoTempStaging
        });
      }
    },
    [destination, intoTempStaging, kingdomsByRegion, previews, source, spatialByRegionId, syncedAt]
  );

  const runRegionLoad = useCallback(
    async (region, { incremental }) => {
      if (!map || isExternalSourcesLoadActive() || busyRegionId) {
        return;
      }

      setBusyRegionId(region.id);
      onLoadError?.(null);

      try {
        await loadOneRegion(region, { incremental });
        await commitLoadedPoints();
        setDatasetRevision((value) => value + 1);
      } catch (error) {
        onLoadError?.(error?.message || "Не удалось выполнить загрузку");
      } finally {
        setBusyRegionId(null);
      }
    },
    [busyRegionId, commitLoadedPoints, loadOneRegion, map, onLoadError]
  );

  const clearRegionDataset = useCallback(
    async (region) => {
      if (!map || isExternalSourcesLoadActive() || busyRegionId) {
        return;
      }

      const sourceLabel = source === "inat" ? "iNaturalist" : "GBIF";
      const confirmed = window.confirm(
        `Удалить скачанный набор ${sourceLabel} для региона «${region.label}»?`
      );
      if (!confirmed) {
        return;
      }

      setBusyRegionId(region.id);
      onLoadError?.(null);

      try {
        const cleared =
          source === "inat"
            ? await clearInatExternalDataset(region.id)
            : await clearGbifExternalDataset(region.id);
        if (!cleared) {
          onLoadError?.("Для этого региона нет локального набора");
        }
        setDatasetRevision((value) => value + 1);
      } catch (error) {
        onLoadError?.(error?.message || "Не удалось удалить набор");
      } finally {
        setBusyRegionId(null);
      }
    },
    [busyRegionId, map, onLoadError, source]
  );

  const runAllLoads = useCallback(
    async ({ incremental }) => {
      if (!map || isExternalSourcesLoadActive() || busyRegionId) {
        return;
      }

      const targets = availableFilteredRegions;
      if (targets.length === 0) {
        onLoadError?.(
          incremental
            ? "Нет доступных регионов для обновления"
            : "Нет доступных регионов для загрузки"
        );
        return;
      }

      if (incremental && !syncedAt) {
        onLoadError?.("Сначала загрузите хотя бы один регион");
        return;
      }

      if (intoTempStaging && !incremental) {
        const incoming = targets.reduce((sum, item) => {
          const count = resolveSelectedCount(
            previews[item.id],
            kingdomsByRegion[item.id] || []
          );
          const loadRegion = withLoadSpatialOverride(item, spatialByRegionId);
          const query = buildLoadQuery(item.id, kingdomsByRegion[item.id] || []);
          const reuse = resolveReusableExternalLoad({
            source: source === "inat" ? "inat" : "gbif",
            region: loadRegion,
            kingdomId: query.kingdomId || "",
            query,
            extras: {}
          });
          if (reuse.mode === "reuse") {
            return sum;
          }
          return sum + (typeof count === "number" ? count : 0);
        }, 0);
        const blocked = getTempLayerLoadBlockMessage(incoming);
        if (blocked) {
          onLoadError?.(blocked);
          return;
        }
      }

      onLoadError?.(null);

      try {
        for (const region of targets) {
          setBusyRegionId(region.id);
          await loadOneRegion(region, { incremental });
        }
        await commitLoadedPoints();
        setDatasetRevision((value) => value + 1);
      } catch (error) {
        onLoadError?.(error?.message || "Не удалось выполнить загрузку");
        setDatasetRevision((value) => value + 1);
      } finally {
        setBusyRegionId(null);
      }
    },
    [
      availableFilteredRegions,
      busyRegionId,
      commitLoadedPoints,
      intoTempStaging,
      kingdomsByRegion,
      loadOneRegion,
      map,
      onLoadError,
      previews,
      source,
      spatialByRegionId,
      syncedAt
    ]
  );

  const sourceLabel = isInat ? "iNaturalist" : "GBIF";
  const batchBusy = Boolean(busyRegionId);
  const canLoadAll =
    Boolean(map) &&
    !batchBusy &&
    !isExternalSourcesLoadActive() &&
    availableFilteredRegions.length > 0;
  const canUpdateAll = canLoadAll && Boolean(syncedAt) && !intoTempStaging;

  return (
    <div className="regions-load-table-wrap">
      <div className="regions-load-table-toolbar">
        <div
          className="regions-load-source-tabs"
          role="tablist"
          aria-label="Источник данных"
        >
          <button
            type="button"
            role="tab"
            aria-selected={source === "gbif"}
            className={
              source === "gbif"
                ? "regions-load-source-tab regions-load-source-tab--active"
                : "regions-load-source-tab"
            }
            onClick={() => setSource("gbif")}
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
            onClick={() => setSource("inat")}
          >
            iNaturalist
          </button>
        </div>

        <LoadDestinationSelect
          value={destination}
          onChange={setDestination}
          source={source}
          disabled={batchBusy || isExternalSourcesLoadActive()}
        />

        <label className="regions-load-table-filter">
          <span className="gbif-panel-label">Поиск</span>
          <input
            type="search"
            className="gbif-panel-input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Название региона"
          />
        </label>

        <div className="regions-load-table-batch">
          <button
            type="button"
            className="gbif-panel-btn"
            disabled={!canLoadAll}
            title={
              availableFilteredRegions.length > 0
                ? `Загрузить ${availableFilteredRegions.length} регион(ов) из текущего списка`
                : "Нет доступных регионов"
            }
            onClick={() => runAllLoads({ incremental: false })}
          >
            Загрузить все
          </button>
          <button
            type="button"
            className="gbif-panel-btn gbif-panel-btn--secondary"
            disabled={!canUpdateAll}
            title={
              canUpdateAll
                ? `Обновить ${availableFilteredRegions.length} регион(ов) с ${syncedAt}`
                : "Сначала загрузите хотя бы один регион"
            }
            onClick={() => runAllLoads({ incremental: true })}
          >
            Обновить все
          </button>
        </div>

        <p className="regions-load-table-hint">
          {previewStatus === "loading"
            ? `Оценка числа точек в ${sourceLabel} по царствам…${
                totalEstimatedBytes != null
                  ? ` Суммарный объём (уже прочитанные): ${formatMegabytes(totalEstimatedBytes)}.`
                  : ""
              }`
            : previewStatus === "error"
              ? "Не удалось полностью оценить регионы"
              : `Регионов: ${formatCount(filteredRegions.length)}. Объём: ${formatMegabytes(
                  totalEstimatedBytes
                )}${
                  intoTempStaging && totalEstimatedBytes != null
                    ? ` · во временном слое ~${formatTempDataSize(
                        estimateTempGeoJsonBytes(
                          Object.values(kingdomTotals).reduce(
                            (sum, value) => sum + (typeof value === "number" ? value : 0),
                            0
                          )
                        )
                      )}`
                    : ""
                }.`}
        </p>
      </div>

      <div className="regions-load-table-scroll">
        <table className="regions-load-table">
          <thead>
            <tr>
              <th scope="col">Регион</th>
              {GBIF_KINGDOMS.map((kingdom) => (
                <th key={kingdom.id} scope="col" title={kingdom.label}>
                  {KINGDOM_SHORT_LABELS[kingdom.id] || kingdom.label}
                </th>
              ))}
              <th scope="col">Объём</th>
              <th scope="col">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredRegions.map((region) => {
              const preview = previews[region.id];
              const kingdomIds = kingdomsByRegion[region.id] || [];
              const selectedBytes = resolveSelectedBytes(preview, kingdomIds);
              const isLoaded = loadedRegionIds.has(region.id);
              const rowBusy = busyRegionId === region.id;
              const canUpdate = isLoaded && Boolean(syncedAt) && !intoTempStaging;
              const hasSpatial = isInat
                ? Boolean(toInatSpatialRegion(region))
                : Boolean(toGbifSpatialRegion(region));
              const unavailable =
                preview?.status === "unavailable" || !hasSpatial;

              return (
                <tr
                  key={region.id}
                  className={
                    isLoaded ? "regions-load-table-row--loaded" : undefined
                  }
                >
                  <th scope="row">{region.label}</th>
                  {GBIF_KINGDOMS.map((kingdom) => {
                    const selected = kingdomIds.includes(kingdom.id);
                    const cellText = unavailable
                      ? "—"
                      : preview?.status === "loading" &&
                          preview[kingdom.id] == null
                        ? "…"
                        : formatCount(preview?.[kingdom.id]);

                    return (
                      <td key={kingdom.id} className="regions-load-table-num">
                        <button
                          type="button"
                          className={
                            selected
                              ? "regions-load-kingdom-cell regions-load-kingdom-cell--selected"
                              : "regions-load-kingdom-cell"
                          }
                          disabled={unavailable || rowBusy}
                          aria-pressed={selected}
                          aria-label={`${kingdom.label}: ${cellText}. ${
                            selected ? "Снять выбор" : "Выбрать"
                          }`}
                          title={
                            unavailable
                              ? undefined
                              : `${kingdom.label} — клик, чтобы ${
                                  selected ? "снять" : "выбрать"
                                }`
                          }
                          onClick={() => toggleKingdom(region.id, kingdom.id)}
                        >
                          {cellText}
                        </button>
                      </td>
                    );
                  })}
                  <td className="regions-load-table-num">
                    {unavailable ? "—" : formatMegabytes(selectedBytes)}
                  </td>
                  <td>
                    <div className="regions-load-table-actions">
                      <button
                        type="button"
                        className="gbif-panel-btn regions-load-action-btn"
                        disabled={
                          !map ||
                          unavailable ||
                          rowBusy ||
                          isExternalSourcesLoadActive()
                        }
                        aria-label="Загрузить"
                        title={
                          unavailable
                            ? isInat
                              ? "Нет placeId iNaturalist"
                              : "Нет GADM-идентификатора"
                            : kingdomIds.length > 0
                              ? `Загрузить: ${kingdomIds.join(", ")}`
                              : "Загрузить"
                        }
                        onClick={() =>
                          runRegionLoad(region, { incremental: false })
                        }
                      >
                        {rowBusy ? (
                          <span className="regions-load-action-busy" aria-hidden="true">
                            …
                          </span>
                        ) : (
                          <DownloadIcon className="regions-load-action-icon" aria-hidden="true" focusable="false" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="gbif-panel-btn gbif-panel-btn--secondary regions-load-action-btn"
                        disabled={
                          !map ||
                          unavailable ||
                          !canUpdate ||
                          rowBusy ||
                          isExternalSourcesLoadActive()
                        }
                        aria-label="Обновить"
                        title={
                          canUpdate
                            ? loadedKingdomsLabel
                              ? `Обновить (локально: ${loadedKingdomsLabel})`
                              : "Обновить"
                            : "Сначала загрузите регион"
                        }
                        onClick={() =>
                          runRegionLoad(region, { incremental: true })
                        }
                      >
                        <RefreshIcon className="regions-load-action-icon" aria-hidden="true" focusable="false" />
                      </button>
                      <button
                        type="button"
                        className="gbif-panel-btn regions-load-action-btn regions-load-action-btn--danger"
                        disabled={
                          !map ||
                          unavailable ||
                          !isLoaded ||
                          rowBusy ||
                          isExternalSourcesLoadActive()
                        }
                        aria-label="Удалить набор"
                        title={
                          isLoaded
                            ? "Удалить скачанный набор данных"
                            : "Нет локального набора для этого региона"
                        }
                        onClick={() => clearRegionDataset(region)}
                      >
                        <TrashIcon className="regions-load-action-icon" aria-hidden="true" focusable="false" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Всего</th>
              {GBIF_KINGDOMS.map((kingdom) => (
                <td key={kingdom.id} className="regions-load-table-num">
                  {formatCount(kingdomTotals[kingdom.id])}
                </td>
              ))}
              <td className="regions-load-table-num">
                {formatMegabytes(totalEstimatedBytes)}
              </td>
              <td aria-hidden="true" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
