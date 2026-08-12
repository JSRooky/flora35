import React, { useEffect, useMemo, useRef, useState } from "react";
import { setGbifData } from "./addGbifLayer";
import { setInatData } from "./addInatLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  GBIF_MAP_UPDATE_PAGES,
  GBIF_PAGE_SIZE,
  getGbifNetworkErrorMessage,
  isGbifAbortError,
  loadOccurrencesForRegion,
  previewOccurrenceCount,
  withUpdateSinceExtras
} from "../gbif/gbifClient";
import {
  getGbifFeatureCollection,
  getGbifFeatureCount,
  getGbifLoadedQuery,
  getGbifLoadedRegionId,
  getGbifSyncedAt,
  setGbifLoadedQuery,
  setGbifSyncedAt,
  upsertGbifFeatures
} from "../gbif/gbifStore";
import { persistGbifSnapshot } from "../gbif/gbifPersistence";
import {
  INAT_API_RESULT_LIMIT,
  INAT_MAP_UPDATE_PAGES,
  INAT_PAGE_SIZE,
  INAT_QUALITY_MODES,
  getInatNetworkErrorMessage,
  isInatAbortError,
  previewObservationCount,
  withInatUpdateSinceExtras
} from "../inaturalist/inatClient";
import {
  estimateInatLoadSeriesCount,
  loadObservationsInSeries
} from "../inaturalist/inatLoadSeries";
import {
  getInatFeatureCollection,
  getInatFeatureCount,
  getInatLoadedQuery,
  getInatLoadedRegionId,
  getInatSyncedAt,
  setInatLoadedQuery,
  setInatSyncedAt,
  upsertInatFeatures
} from "../inaturalist/inatStore";
import { persistInatSnapshot } from "../inaturalist/inatPersistence";
import {
  DEFAULT_EXTERNAL_REGION_ID,
  EXTERNAL_REGIONS,
  getExternalRegionById
} from "../externalSources/regions";
import { GBIF_KINGDOMS, buildTaxonSearchExtras } from "../gbif/taxonFilters";
import "../styles/GbifPanel.css";

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(value);
}

const KINGDOM_TO_INAT_ICONIC = {
  plantae: "Plantae",
  animalia: "Animalia",
  fungi: "Fungi",
  protozoa: "Protozoa"
};

const KINGDOM_LOAD_OPTIONS = [
  { value: "", label: "Все царства" },
  ...GBIF_KINGDOMS.map(({ id, label }) => ({ value: id, label }))
];

function buildGbifQuerySnapshot(regionId, kingdomId = null) {
  return { regionId, kingdomId: kingdomId || null };
}

function buildInatQuerySnapshot(regionId, qualityGrade, kingdomId = null) {
  return { regionId, qualityGrade, kingdomId: kingdomId || null };
}

function isSameGbifQuery(a, b) {
  return Boolean(
    a &&
      b &&
      a.regionId === b.regionId &&
      (a.kingdomId || null) === (b.kingdomId || null)
  );
}

function isSameInatQuery(a, b) {
  return Boolean(
    a &&
      b &&
      a.regionId === b.regionId &&
      (a.qualityGrade ?? INAT_QUALITY_MODES.RESEARCH) ===
        (b.qualityGrade ?? INAT_QUALITY_MODES.RESEARCH) &&
      (a.kingdomId || null) === (b.kingdomId || null)
  );
}

function buildGbifLoadExtras(kingdomId, incrementalExtras = {}) {
  return {
    ...incrementalExtras,
    ...buildTaxonSearchExtras({ kingdomId: kingdomId || null })
  };
}

function buildInatLoadExtras(kingdomId, incrementalExtras = {}) {
  const extras = { ...incrementalExtras };
  const iconic = kingdomId ? KINGDOM_TO_INAT_ICONIC[kingdomId] : null;
  if (iconic) {
    extras.iconicTaxa = iconic;
  }
  return extras;
}

function getInitialRegionId() {
  return (
    getGbifLoadedRegionId() ||
    getInatLoadedRegionId() ||
    getGbifLoadedQuery()?.regionId ||
    getInatLoadedQuery()?.regionId ||
    DEFAULT_EXTERNAL_REGION_ID
  );
}

const INAT_QUALITY_OPTIONS = [
  { value: INAT_QUALITY_MODES.RESEARCH, label: "Research grade (проверенные)" },
  { value: INAT_QUALITY_MODES.CASUAL, label: "Casual" },
  { value: INAT_QUALITY_MODES.ALL, label: "Research + casual" }
];

function SourceLoadStatus({
  loading,
  previewLoading,
  incrementalUpdate,
  loaded,
  total,
  previewCount,
  fetched,
  added,
  pageSize,
  seriesIndex = null,
  seriesTotal = null,
  seriesLabel = null
}) {
  if (loading) {
    return (
      <dl className="gbif-panel-status-list">
        {seriesIndex != null ? (
          <div className="gbif-panel-status-row">
            <dt>Серия</dt>
            <dd>
              <strong>{seriesIndex}</strong>
              {seriesTotal != null ? (
                <>
                  {" "}
                  из <strong>{formatCount(seriesTotal)}</strong>
                </>
              ) : null}
              {seriesLabel ? <> · {seriesLabel}</> : null}
            </dd>
          </div>
        ) : null}
        <div className="gbif-panel-status-row">
          <dt>Получено</dt>
          <dd>
            <strong>{formatCount(fetched)}</strong>
            {total != null ? (
              <>
                {" "}
                из <strong>{formatCount(total)}</strong>
              </>
            ) : null}
          </dd>
        </div>
        <div className="gbif-panel-status-row">
          <dt>Новых</dt>
          <dd>
            <strong>{formatCount(added)}</strong>
          </dd>
        </div>
        <div className="gbif-panel-status-row">
          <dt>На слое</dt>
          <dd>
            <strong>{formatCount(loaded)}</strong>
          </dd>
        </div>
      </dl>
    );
  }

  if (previewLoading) {
    return (
      <p className="gbif-panel-status-text">
        {incrementalUpdate ? "Оценка обновлений…" : "Оценка числа находок…"}
      </p>
    );
  }

  if (loaded > 0 || previewCount != null) {
    return (
      <dl className="gbif-panel-status-list">
        {loaded > 0 ? (
          <div className="gbif-panel-status-row">
            <dt>На слое</dt>
            <dd>
              <strong>{formatCount(loaded)}</strong>
            </dd>
          </div>
        ) : null}
        {previewCount != null ? (
          <div className="gbif-panel-status-row">
            <dt>{incrementalUpdate ? "Обновлений" : "По региону"}</dt>
            <dd>
              ≈ <strong>{formatCount(previewCount)}</strong>
              {!incrementalUpdate && pageSize ? (
                <> (~{formatCount(Math.ceil(previewCount / pageSize))} стр.)</>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    );
  }

  return <p className="gbif-panel-status-text">Оценка появится после выбора региона</p>;
}

/** Панель загрузки внешних источников: GBIF и iNaturalist. */
export default function DataSourcesPanel({
  map,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose,
  onDataChange,
  onOpenProcessing
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [regionId, setRegionId] = useState(getInitialRegionId);
  const [gbifKingdomId, setGbifKingdomId] = useState(
    () => getGbifLoadedQuery()?.kingdomId ?? ""
  );
  const [inatKingdomId, setInatKingdomId] = useState(
    () => getInatLoadedQuery()?.kingdomId ?? ""
  );
  const [inatQualityGrade, setInatQualityGrade] = useState(
    () => getInatLoadedQuery()?.qualityGrade ?? INAT_QUALITY_MODES.RESEARCH
  );

  const [gbifLoading, setGbifLoading] = useState(false);
  const [inatLoading, setInatLoading] = useState(false);
  const [gbifLoaded, setGbifLoaded] = useState(getGbifFeatureCount);
  const [inatLoaded, setInatLoaded] = useState(getInatFeatureCount);
  const [gbifPreview, setGbifPreview] = useState(null);
  const [inatPreview, setInatPreview] = useState(null);
  const [gbifPreviewLoading, setGbifPreviewLoading] = useState(false);
  const [inatPreviewLoading, setInatPreviewLoading] = useState(false);
  const [gbifTotal, setGbifTotal] = useState(null);
  const [inatTotal, setInatTotal] = useState(null);
  const [gbifFetched, setGbifFetched] = useState(0);
  const [inatFetched, setInatFetched] = useState(0);
  const [gbifAdded, setGbifAdded] = useState(0);
  const [inatAdded, setInatAdded] = useState(0);
  const [inatSeriesIndex, setInatSeriesIndex] = useState(null);
  const [inatSeriesTotal, setInatSeriesTotal] = useState(null);
  const [inatSeriesLabel, setInatSeriesLabel] = useState(null);
  const [gbifSyncedAt, setGbifSyncedAtState] = useState(() => getGbifSyncedAt());
  const [inatSyncedAt, setInatSyncedAtState] = useState(() => getInatSyncedAt());
  const [gbifSavedQuery, setGbifSavedQuery] = useState(() => getGbifLoadedQuery());
  const [inatSavedQuery, setInatSavedQuery] = useState(() => getInatLoadedQuery());
  const [gbifError, setGbifError] = useState(null);
  const [inatError, setInatError] = useState(null);
  const [loadDialogSource, setLoadDialogSource] = useState(null);
  const [draftRegionId, setDraftRegionId] = useState(getInitialRegionId);
  const [draftKingdomId, setDraftKingdomId] = useState("");
  const [draftQualityGrade, setDraftQualityGrade] = useState(INAT_QUALITY_MODES.RESEARCH);
  const [dialogPreview, setDialogPreview] = useState(null);
  const [dialogPreviewLoading, setDialogPreviewLoading] = useState(false);

  const gbifAbortRef = useRef(null);
  const inatAbortRef = useRef(null);
  const gbifPreviewAbortRef = useRef(null);
  const inatPreviewAbortRef = useRef(null);
  const dialogPreviewAbortRef = useRef(null);

  const region = getExternalRegionById(regionId);
  const draftRegion = getExternalRegionById(draftRegionId);
  const gbifQuery = useMemo(
    () => buildGbifQuerySnapshot(regionId, gbifKingdomId || null),
    [regionId, gbifKingdomId]
  );
  const inatQuery = useMemo(
    () => buildInatQuerySnapshot(regionId, inatQualityGrade, inatKingdomId || null),
    [regionId, inatQualityGrade, inatKingdomId]
  );

  const gbifIncremental =
    gbifLoaded > 0 && isSameGbifQuery(gbifQuery, gbifSavedQuery) && Boolean(gbifSyncedAt);
  const inatIncremental =
    inatLoaded > 0 && isSameInatQuery(inatQuery, inatSavedQuery) && Boolean(inatSyncedAt);

  const gbifRequestExtras = useMemo(
    () =>
      buildGbifLoadExtras(
        gbifKingdomId,
        gbifIncremental ? withUpdateSinceExtras({}, gbifSyncedAt) : {}
      ),
    [gbifKingdomId, gbifIncremental, gbifSyncedAt]
  );
  const inatRequestExtras = useMemo(
    () =>
      buildInatLoadExtras(
        inatKingdomId,
        inatIncremental ? withInatUpdateSinceExtras({}, inatSyncedAt) : {}
      ),
    [inatKingdomId, inatIncremental, inatSyncedAt]
  );

  const loading = gbifLoading || inatLoading;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const openLoadDialog = (source) => {
    setDraftRegionId(regionId);
    setDraftKingdomId(source === "gbif" ? gbifKingdomId : inatKingdomId);
    setDraftQualityGrade(inatQualityGrade);
    setDialogPreview(null);
    setLoadDialogSource(source);
  };

  const closeLoadDialog = () => {
    dialogPreviewAbortRef.current?.abort();
    setLoadDialogSource(null);
    setDialogPreview(null);
    setDialogPreviewLoading(false);
  };

  useEffect(() => {
    return () => {
      gbifAbortRef.current?.abort();
      inatAbortRef.current?.abort();
      gbifPreviewAbortRef.current?.abort();
      inatPreviewAbortRef.current?.abort();
      dialogPreviewAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!region) {
      setGbifPreview(null);
      setInatPreview(null);
      return undefined;
    }

    gbifPreviewAbortRef.current?.abort();
    const gbifController = new AbortController();
    gbifPreviewAbortRef.current = gbifController;
    setGbifPreviewLoading(true);

    const gbifTimer = window.setTimeout(() => {
      previewOccurrenceCount(region, {
        signal: gbifController.signal,
        extras: gbifRequestExtras
      })
        .then((count) => {
          if (!gbifController.signal.aborted) {
            setGbifPreview(count);
          }
        })
        .catch((err) => {
          if (!isGbifAbortError(err, gbifController.signal)) {
            setGbifPreview(null);
          }
        })
        .finally(() => {
          if (!gbifController.signal.aborted) {
            setGbifPreviewLoading(false);
          }
        });
    }, 250);

    inatPreviewAbortRef.current?.abort();
    const inatController = new AbortController();
    inatPreviewAbortRef.current = inatController;
    setInatPreviewLoading(true);

    const inatTimer = window.setTimeout(() => {
      previewObservationCount(region, {
        signal: inatController.signal,
        qualityGrade: inatQualityGrade,
        extras: inatRequestExtras
      })
        .then((count) => {
          if (!inatController.signal.aborted) {
            setInatPreview(count);
          }
        })
        .catch((err) => {
          if (!isInatAbortError(err, inatController.signal)) {
            setInatPreview(null);
          }
        })
        .finally(() => {
          if (!inatController.signal.aborted) {
            setInatPreviewLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(gbifTimer);
      window.clearTimeout(inatTimer);
      gbifController.abort();
      inatController.abort();
    };
  }, [region, gbifRequestExtras, inatRequestExtras, inatQualityGrade]);

  // Оценка объёма в диалоге загрузки при смене черновых фильтров.
  useEffect(() => {
    if (!loadDialogSource || !draftRegion) {
      setDialogPreview(null);
      return undefined;
    }

    dialogPreviewAbortRef.current?.abort();
    const controller = new AbortController();
    dialogPreviewAbortRef.current = controller;
    setDialogPreviewLoading(true);

    const timer = window.setTimeout(() => {
      if (loadDialogSource === "gbif") {
        const draftQuery = buildGbifQuerySnapshot(draftRegionId, draftKingdomId || null);
        const incremental =
          gbifLoaded > 0 &&
          isSameGbifQuery(draftQuery, gbifSavedQuery) &&
          Boolean(gbifSyncedAt);
        const extras = buildGbifLoadExtras(
          draftKingdomId,
          incremental ? withUpdateSinceExtras({}, gbifSyncedAt) : {}
        );

        previewOccurrenceCount(draftRegion, { signal: controller.signal, extras })
          .then((count) => {
            if (!controller.signal.aborted) {
              setDialogPreview(count);
            }
          })
          .catch((err) => {
            if (!isGbifAbortError(err, controller.signal)) {
              setDialogPreview(null);
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setDialogPreviewLoading(false);
            }
          });
        return;
      }

      const draftQuery = buildInatQuerySnapshot(
        draftRegionId,
        draftQualityGrade,
        draftKingdomId || null
      );
      const incremental =
        inatLoaded > 0 &&
        isSameInatQuery(draftQuery, inatSavedQuery) &&
        Boolean(inatSyncedAt);
      const extras = buildInatLoadExtras(
        draftKingdomId,
        incremental ? withInatUpdateSinceExtras({}, inatSyncedAt) : {}
      );

      previewObservationCount(draftRegion, {
        signal: controller.signal,
        qualityGrade: draftQualityGrade,
        extras
      })
        .then((count) => {
          if (!controller.signal.aborted) {
            setDialogPreview(count);
          }
        })
        .catch((err) => {
          if (!isInatAbortError(err, controller.signal)) {
            setDialogPreview(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setDialogPreviewLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    loadDialogSource,
    draftRegion,
    draftRegionId,
    draftKingdomId,
    draftQualityGrade,
    gbifLoaded,
    gbifSavedQuery,
    gbifSyncedAt,
    inatLoaded,
    inatSavedQuery,
    inatSyncedAt
  ]);

  const notifyDataChange = () => {
    onDataChange?.();
  };

  const runGbifLoad = async ({
    loadRegion = region,
    loadKingdomId = gbifKingdomId,
    loadExtras = gbifRequestExtras,
    loadQuery = gbifQuery,
    previewCount = gbifPreview
  } = {}) => {
    if (!map || !loadRegion) {
      return;
    }

    gbifAbortRef.current?.abort();
    const controller = new AbortController();
    gbifAbortRef.current = controller;

    setGbifError(null);
    setGbifLoading(true);
    setGbifTotal(previewCount);
    setGbifAdded(0);
    setGbifFetched(0);

    let pagesSinceMapUpdate = 0;
    let addedTotal = 0;
    let fetchedTotal = 0;
    let succeeded = false;

    try {
      await loadOccurrencesForRegion(loadRegion, {
        signal: controller.signal,
        extras: loadExtras,
        onPage: (features) => {
          fetchedTotal += features.length;
          setGbifFetched(fetchedTotal);
          const { collection, added } = upsertGbifFeatures(features, loadRegion.id);
          addedTotal += added;
          setGbifAdded(addedTotal);
          setGbifLoaded(collection.features.length);
          pagesSinceMapUpdate += 1;
          if (pagesSinceMapUpdate >= GBIF_MAP_UPDATE_PAGES) {
            setGbifData(map, collection);
            pagesSinceMapUpdate = 0;
          }
        },
        onProgress: ({ total: nextTotal }) => {
          if (typeof nextTotal === "number") {
            setGbifTotal(nextTotal);
          }
        }
      });

      setGbifData(map, getGbifFeatureCollection());
      succeeded = true;
    } catch (err) {
      if (!isGbifAbortError(err, controller.signal)) {
        setGbifError(getGbifNetworkErrorMessage(err));
      } else {
        setGbifData(map, getGbifFeatureCollection());
      }
    } finally {
      if (gbifAbortRef.current === controller) {
        gbifAbortRef.current = null;
      }
      setGbifLoading(false);
      setGbifLoaded(getGbifFeatureCount());
      // syncedAt/query только при успехе — иначе «Обновить» пропустит недокачанное.
      if (succeeded) {
        const nextSyncedAt = new Date().toISOString();
        setRegionId(loadRegion.id);
        setGbifKingdomId(loadKingdomId || "");
        setGbifLoadedQuery(loadQuery);
        setGbifSavedQuery(loadQuery);
        setGbifSyncedAt(nextSyncedAt);
        setGbifSyncedAtState(nextSyncedAt);
      }
      await persistGbifSnapshot();
      notifyDataChange();
    }
  };

  const runInatLoad = async ({
    loadRegion = region,
    loadKingdomId = inatKingdomId,
    loadQualityGrade = inatQualityGrade,
    loadExtras = inatRequestExtras,
    loadQuery = inatQuery,
    previewCount = inatPreview
  } = {}) => {
    if (!map || !loadRegion) {
      return;
    }

    inatAbortRef.current?.abort();
    const controller = new AbortController();
    inatAbortRef.current = controller;

    setInatError(null);
    setInatLoading(true);
    setInatTotal(previewCount);
    setInatAdded(0);
    setInatFetched(0);
    setInatSeriesIndex(null);
    setInatSeriesTotal(
      previewCount != null ? estimateInatLoadSeriesCount(previewCount) : null
    );
    setInatSeriesLabel(null);

    let pagesSinceMapUpdate = 0;
    let addedTotal = 0;
    let fetchedTotal = 0;
    let succeeded = false;

    try {
      await loadObservationsInSeries(loadRegion, {
        signal: controller.signal,
        qualityGrade: loadQualityGrade,
        extras: loadExtras,
        previewCount,
        onSeriesStart: ({ series, index, planned, queued }) => {
          setInatSeriesIndex(index);
          setInatSeriesTotal(Math.max(planned, queued, index));
          setInatSeriesLabel(series.label);
        },
        onPage: (features) => {
          fetchedTotal += features.length;
          setInatFetched(fetchedTotal);
          const { collection, added } = upsertInatFeatures(features, loadRegion.id);
          addedTotal += added;
          setInatAdded(addedTotal);
          setInatLoaded(collection.features.length);
          pagesSinceMapUpdate += 1;
          if (pagesSinceMapUpdate >= INAT_MAP_UPDATE_PAGES) {
            setInatData(map, collection);
            pagesSinceMapUpdate = 0;
          }
        },
        onProgress: ({ total: nextTotal }) => {
          if (typeof nextTotal === "number") {
            setInatTotal(nextTotal);
          }
        }
      });

      setInatData(map, getInatFeatureCollection());
      succeeded = true;
    } catch (err) {
      if (!isInatAbortError(err, controller.signal)) {
        setInatError(getInatNetworkErrorMessage(err));
      } else {
        setInatData(map, getInatFeatureCollection());
      }
    } finally {
      if (inatAbortRef.current === controller) {
        inatAbortRef.current = null;
      }
      setInatLoading(false);
      setInatSeriesIndex(null);
      setInatSeriesTotal(null);
      setInatSeriesLabel(null);
      setInatLoaded(getInatFeatureCount());
      // syncedAt/query только при успехе — иначе «Обновить» пропустит недокачанное.
      if (succeeded) {
        const nextSyncedAt = new Date().toISOString();
        setRegionId(loadRegion.id);
        setInatKingdomId(loadKingdomId || "");
        setInatQualityGrade(loadQualityGrade);
        setInatLoadedQuery(loadQuery);
        setInatSavedQuery(loadQuery);
        setInatSyncedAt(nextSyncedAt);
        setInatSyncedAtState(nextSyncedAt);
      }
      await persistInatSnapshot();
      notifyDataChange();
    }
  };

  const handleConfirmLoad = async () => {
    const source = loadDialogSource;
    if (!source || !draftRegion) {
      return;
    }

    const nextKingdomId = draftKingdomId || "";
    const nextQuality = draftQualityGrade;

    if (source === "gbif") {
      const nextQuery = buildGbifQuerySnapshot(draftRegion.id, nextKingdomId || null);
      const incremental =
        gbifLoaded > 0 &&
        isSameGbifQuery(nextQuery, gbifSavedQuery) &&
        Boolean(gbifSyncedAt);
      const extras = buildGbifLoadExtras(
        nextKingdomId,
        incremental ? withUpdateSinceExtras({}, gbifSyncedAt) : {}
      );
      closeLoadDialog();
      await runGbifLoad({
        loadRegion: draftRegion,
        loadKingdomId: nextKingdomId,
        loadExtras: extras,
        loadQuery: nextQuery,
        previewCount: dialogPreview
      });
      return;
    }

    const nextQuery = buildInatQuerySnapshot(
      draftRegion.id,
      nextQuality,
      nextKingdomId || null
    );
    const incremental =
      inatLoaded > 0 &&
      isSameInatQuery(nextQuery, inatSavedQuery) &&
      Boolean(inatSyncedAt);
    const extras = buildInatLoadExtras(
      nextKingdomId,
      incremental ? withInatUpdateSinceExtras({}, inatSyncedAt) : {}
    );
    closeLoadDialog();
    await runInatLoad({
      loadRegion: draftRegion,
      loadKingdomId: nextKingdomId,
      loadQualityGrade: nextQuality,
      loadExtras: extras,
      loadQuery: nextQuery,
      previewCount: dialogPreview
    });
  };

  const dialogIncremental =
    loadDialogSource === "gbif"
      ? gbifLoaded > 0 &&
        isSameGbifQuery(
          buildGbifQuerySnapshot(draftRegionId, draftKingdomId || null),
          gbifSavedQuery
        ) &&
        Boolean(gbifSyncedAt)
      : loadDialogSource === "inat"
        ? inatLoaded > 0 &&
          isSameInatQuery(
            buildInatQuerySnapshot(
              draftRegionId,
              draftQualityGrade,
              draftKingdomId || null
            ),
            inatSavedQuery
          ) &&
          Boolean(inatSyncedAt)
        : false;

  const inatSeriesEstimate =
    inatPreview != null ? estimateInatLoadSeriesCount(inatPreview) : null;
  const inatMultiSeriesLoad =
    inatPreview != null && inatPreview > INAT_API_RESULT_LIMIT && !inatIncremental;
  const dialogSeriesEstimate =
    dialogPreview != null ? estimateInatLoadSeriesCount(dialogPreview) : null;
  const dialogMultiSeries =
    loadDialogSource === "inat" &&
    dialogPreview != null &&
    dialogPreview > INAT_API_RESULT_LIMIT &&
    !dialogIncremental;

  return (
    <div className={`feature-popup gbif-panel ${collapsed ? "feature-popup--collapsed" : ""}`}>
      <div className="feature-popup-header">
        <h3 className="feature-popup-title">Источники данных</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          {onCollapsedChange ? (
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {collapsed ? "▾" : "▴"}
            </button>
          ) : null}
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
      </div>

      {collapsed ? (
        <p className="popup-collapsed-summary">
          {loading
            ? "Загрузка…"
            : `GBIF: ${formatCount(gbifLoaded)} · iNat: ${formatCount(inatLoaded)}`}
        </p>
      ) : (
        <div className="gbif-panel-content">
          <section className="data-sources-section" aria-label="GBIF">
            <h4 className="data-sources-section-title">GBIF</h4>
            <div
              className={`gbif-panel-status${gbifLoading ? " gbif-panel-status--loading" : ""}`}
            >
              <SourceLoadStatus
                loading={gbifLoading}
                previewLoading={gbifPreviewLoading}
                incrementalUpdate={gbifIncremental}
                loaded={gbifLoaded}
                total={gbifTotal}
                previewCount={gbifPreview}
                fetched={gbifFetched}
                added={gbifAdded}
                pageSize={GBIF_PAGE_SIZE}
              />
            </div>
            <div className="gbif-panel-actions">
              <button
                type="button"
                className="gbif-panel-btn"
                disabled={!map || gbifLoading}
                onClick={() => openLoadDialog("gbif")}
              >
                {gbifIncremental ? "Обновить" : "Загрузить"}
              </button>
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                disabled={!gbifLoading}
                onClick={() => gbifAbortRef.current?.abort()}
              >
                Отменить
              </button>
            </div>
            {gbifError ? <p className="gbif-panel-error">{gbifError}</p> : null}
          </section>

          <section className="data-sources-section" aria-label="iNaturalist">
            <h4 className="data-sources-section-title">iNaturalist</h4>
            {inatMultiSeriesLoad ? (
              <p className="gbif-panel-hint">
                Наблюдений больше {formatCount(INAT_API_RESULT_LIMIT)} — загрузка пойдёт
                сериями (≈ {formatCount(inatSeriesEstimate)} и более) по группам таксонов и,
                при необходимости, по годам. Все серии объединяются в одну локальную копию.
              </p>
            ) : null}
            <div
              className={`gbif-panel-status${inatLoading ? " gbif-panel-status--loading" : ""}`}
            >
              <SourceLoadStatus
                loading={inatLoading}
                previewLoading={inatPreviewLoading}
                incrementalUpdate={inatIncremental}
                loaded={inatLoaded}
                total={inatTotal}
                previewCount={inatPreview}
                fetched={inatFetched}
                added={inatAdded}
                pageSize={INAT_PAGE_SIZE}
                seriesIndex={inatSeriesIndex}
                seriesTotal={inatSeriesTotal}
                seriesLabel={inatSeriesLabel}
              />
            </div>
            <div className="gbif-panel-actions">
              <button
                type="button"
                className="gbif-panel-btn"
                disabled={!map || inatLoading}
                onClick={() => openLoadDialog("inat")}
              >
                {inatIncremental ? "Обновить" : "Загрузить"}
              </button>
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                disabled={!inatLoading}
                onClick={() => inatAbortRef.current?.abort()}
              >
                Отменить
              </button>
            </div>
            {inatError ? <p className="gbif-panel-error">{inatError}</p> : null}
          </section>

          <button
            type="button"
            className="gbif-panel-btn gbif-panel-btn--processing"
            onClick={() => onOpenProcessing?.()}
          >
            Обработка внешних данных
          </button>
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.DATA_SOURCES} open={helpOpen} />

      {loadDialogSource && (
        <div className="gbif-confirm-overlay" onClick={closeLoadDialog}>
          <div
            className="gbif-confirm-dialog gbif-confirm-dialog--load-options"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-sources-load-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="data-sources-load-title" className="gbif-confirm-title">
              {loadDialogSource === "gbif"
                ? dialogIncremental
                  ? "Обновить GBIF"
                  : "Загрузить GBIF"
                : dialogIncremental
                  ? "Обновить iNaturalist"
                  : "Загрузить iNaturalist"}
            </h4>

            <label className="gbif-panel-field" htmlFor="data-sources-load-region">
              <span className="gbif-panel-label">Регион</span>
              <select
                id="data-sources-load-region"
                className="gbif-panel-select"
                value={draftRegionId}
                onChange={(event) => setDraftRegionId(event.target.value)}
              >
                {EXTERNAL_REGIONS.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="gbif-panel-field" htmlFor="data-sources-load-kingdom">
              <span className="gbif-panel-label">Царство</span>
              <select
                id="data-sources-load-kingdom"
                className="gbif-panel-select"
                value={draftKingdomId}
                onChange={(event) => setDraftKingdomId(event.target.value)}
              >
                {KINGDOM_LOAD_OPTIONS.map(({ value, label }) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {loadDialogSource === "inat" ? (
              <label className="gbif-panel-field" htmlFor="data-sources-load-quality">
                <span className="gbif-panel-label">Качество наблюдений</span>
                <select
                  id="data-sources-load-quality"
                  className="gbif-panel-select"
                  value={draftQualityGrade}
                  onChange={(event) => setDraftQualityGrade(event.target.value)}
                >
                  {INAT_QUALITY_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <p className="gbif-confirm-text">
              {dialogPreviewLoading
                ? "Оценка числа находок…"
                : dialogPreview != null
                  ? `≈ ${formatCount(dialogPreview)} находок по выбранным фильтрам.`
                  : "Выберите параметры загрузки."}
              {dialogMultiSeries
                ? ` Загрузка пойдёт сериями (≈ ${formatCount(dialogSeriesEstimate)}).`
                : null}{" "}
              Данные сохранятся локально и добавятся к уже загруженным (дубликаты обновятся).
            </p>

            <div className="gbif-confirm-actions">
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                onClick={closeLoadDialog}
              >
                Отмена
              </button>
              <button
                type="button"
                className="gbif-panel-btn"
                disabled={!draftRegion}
                onClick={handleConfirmLoad}
              >
                {dialogIncremental ? "Обновить" : "Загрузить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
