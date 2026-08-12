import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setGbifData } from "./addGbifLayer";
import { setInatData } from "./addInatLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  GBIF_PAGE_SIZE,
  isGbifAbortError,
  previewOccurrenceCount,
  withUpdateSinceExtras
} from "../gbif/gbifClient";
import {
  estimateGbifLoadSeriesCount,
  GBIF_SERIES_SOFT_LIMIT
} from "../gbif/gbifLoadSeries";
import {
  getGbifFeatureCollection,
  getGbifFeatureCount,
  getGbifLoadedQuery,
  getGbifLoadedRegionId,
  getGbifSyncedAt,
  setGbifLoadedQuery
} from "../gbif/gbifStore";
import { clearGbifStoreAndPersistence } from "../gbif/gbifPersistence";
import {
  INAT_API_RESULT_LIMIT,
  INAT_PAGE_SIZE,
  INAT_QUALITY_MODES,
  isInatAbortError,
  previewObservationCount,
  withInatUpdateSinceExtras
} from "../inaturalist/inatClient";
import { estimateInatLoadSeriesCount } from "../inaturalist/inatLoadSeries";
import {
  getInatFeatureCollection,
  getInatFeatureCount,
  getInatLoadedQuery,
  getInatLoadedRegionId,
  getInatSyncedAt
} from "../inaturalist/inatStore";
import { clearInatStoreAndPersistence } from "../inaturalist/inatPersistence";
import {
  DEFAULT_EXTERNAL_REGION_ID,
  EXTERNAL_REGIONS,
  getExternalRegionById
} from "../externalSources/regions";
import {
  cancelGbifExternalLoad,
  cancelInatExternalLoad,
  getExternalSourcesLoadSnapshot,
  setExternalSourcesLoadContext,
  startGbifExternalLoad,
  startInatExternalLoad,
  subscribeExternalSourcesLoad
} from "../externalSources/externalSourcesLoadManager";
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
  onOpenProcessing,
  storeRevision = 0
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

  const initialLoadSnapshot = getExternalSourcesLoadSnapshot();
  const [gbifLoading, setGbifLoading] = useState(() => initialLoadSnapshot.gbif.loading);
  const [inatLoading, setInatLoading] = useState(() => initialLoadSnapshot.inat.loading);
  const [gbifLoaded, setGbifLoaded] = useState(
    () => initialLoadSnapshot.gbif.loaded || getGbifFeatureCount()
  );
  const [inatLoaded, setInatLoaded] = useState(
    () => initialLoadSnapshot.inat.loaded || getInatFeatureCount()
  );
  const [gbifPreview, setGbifPreview] = useState(null);
  const [inatPreview, setInatPreview] = useState(null);
  const [gbifPreviewLoading, setGbifPreviewLoading] = useState(false);
  const [inatPreviewLoading, setInatPreviewLoading] = useState(false);
  const [gbifTotal, setGbifTotal] = useState(() => initialLoadSnapshot.gbif.total);
  const [inatTotal, setInatTotal] = useState(() => initialLoadSnapshot.inat.total);
  const [gbifFetched, setGbifFetched] = useState(() => initialLoadSnapshot.gbif.fetched);
  const [inatFetched, setInatFetched] = useState(() => initialLoadSnapshot.inat.fetched);
  const [gbifAdded, setGbifAdded] = useState(() => initialLoadSnapshot.gbif.added);
  const [inatAdded, setInatAdded] = useState(() => initialLoadSnapshot.inat.added);
  const [gbifSeriesIndex, setGbifSeriesIndex] = useState(
    () => initialLoadSnapshot.gbif.seriesIndex
  );
  const [gbifSeriesTotal, setGbifSeriesTotal] = useState(
    () => initialLoadSnapshot.gbif.seriesTotal
  );
  const [gbifSeriesLabel, setGbifSeriesLabel] = useState(
    () => initialLoadSnapshot.gbif.seriesLabel
  );
  const [inatSeriesIndex, setInatSeriesIndex] = useState(
    () => initialLoadSnapshot.inat.seriesIndex
  );
  const [inatSeriesTotal, setInatSeriesTotal] = useState(
    () => initialLoadSnapshot.inat.seriesTotal
  );
  const [inatSeriesLabel, setInatSeriesLabel] = useState(
    () => initialLoadSnapshot.inat.seriesLabel
  );
  const [gbifSyncedAt, setGbifSyncedAtState] = useState(() => getGbifSyncedAt());
  const [inatSyncedAt, setInatSyncedAtState] = useState(() => getInatSyncedAt());
  const [gbifSavedQuery, setGbifSavedQuery] = useState(() => getGbifLoadedQuery());
  const [inatSavedQuery, setInatSavedQuery] = useState(() => getInatLoadedQuery());
  const [gbifError, setGbifError] = useState(() => initialLoadSnapshot.gbif.error);
  const [inatError, setInatError] = useState(() => initialLoadSnapshot.inat.error);
  const [loadDialogSource, setLoadDialogSource] = useState(null);
  /** "load" — обычная загрузка/инкремент; "full" — заменить локальную копию. */
  const [loadDialogMode, setLoadDialogMode] = useState("load");
  const [draftRegionId, setDraftRegionId] = useState(getInitialRegionId);
  const [draftKingdomId, setDraftKingdomId] = useState("");
  const [draftQualityGrade, setDraftQualityGrade] = useState(INAT_QUALITY_MODES.RESEARCH);
  const [dialogPreview, setDialogPreview] = useState(null);
  const [dialogPreviewLoading, setDialogPreviewLoading] = useState(false);

  const gbifPreviewAbortRef = useRef(null);
  const inatPreviewAbortRef = useRef(null);
  const dialogPreviewAbortRef = useRef(null);
  const appliedGbifSyncedAtRef = useRef(null);
  const appliedInatSyncedAtRef = useRef(null);
  const wasGbifLoadingRef = useRef(initialLoadSnapshot.gbif.loading);
  const wasInatLoadingRef = useRef(initialLoadSnapshot.inat.loading);

  const syncGbifIncrementalFromStore = useCallback(() => {
    const count = getGbifFeatureCount();
    const storeQuery = getGbifLoadedQuery();
    const storeSyncedAt = getGbifSyncedAt();
    const storeRegionId = storeQuery?.regionId || getGbifLoadedRegionId();

    setGbifLoaded(count);

    if (storeSyncedAt) {
      setGbifSyncedAtState(storeSyncedAt);
      appliedGbifSyncedAtRef.current = storeSyncedAt;
    }

    if (storeQuery && typeof storeQuery === "object") {
      setGbifSavedQuery(storeQuery);
      if (storeQuery.regionId) {
        setRegionId(storeQuery.regionId);
      }
      setGbifKingdomId(storeQuery.kingdomId || "");
      return;
    }

    // Store с точками, но без query (старый снимок) — синтезируем.
    if (count > 0 && storeRegionId) {
      const synthesized = { regionId: storeRegionId, kingdomId: null };
      setGbifLoadedQuery(synthesized);
      setGbifSavedQuery(synthesized);
      setRegionId(storeRegionId);
      setGbifKingdomId("");
      if (!storeSyncedAt) {
        // Без syncedAt инкремент невозможен — хотя бы зафиксируем query.
      }
    }
  }, []);

  const syncInatIncrementalFromStore = useCallback(() => {
    const count = getInatFeatureCount();
    const storeQuery = getInatLoadedQuery();
    const storeSyncedAt = getInatSyncedAt();
    const storeRegionId = storeQuery?.regionId || getInatLoadedRegionId();

    setInatLoaded(count);

    if (storeSyncedAt) {
      setInatSyncedAtState(storeSyncedAt);
      appliedInatSyncedAtRef.current = storeSyncedAt;
    }

    if (storeQuery && typeof storeQuery === "object") {
      setInatSavedQuery(storeQuery);
      if (storeQuery.regionId) {
        setRegionId(storeQuery.regionId);
      }
      setInatKingdomId(storeQuery.kingdomId || "");
      if (storeQuery.qualityGrade) {
        setInatQualityGrade(storeQuery.qualityGrade);
      }
      return;
    }

    if (count > 0 && storeRegionId) {
      const synthesized = {
        regionId: storeRegionId,
        qualityGrade: INAT_QUALITY_MODES.RESEARCH,
        kingdomId: null
      };
      setInatSavedQuery(synthesized);
      setRegionId(storeRegionId);
      setInatKingdomId("");
    }
  }, []);

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

  const openLoadDialog = (source, mode = "load") => {
    setDraftRegionId(regionId);
    setDraftKingdomId(source === "gbif" ? gbifKingdomId : inatKingdomId);
    setDraftQualityGrade(inatQualityGrade);
    setDialogPreview(null);
    setLoadDialogMode(mode === "full" ? "full" : "load");
    setLoadDialogSource(source);
  };

  const closeLoadDialog = () => {
    dialogPreviewAbortRef.current?.abort();
    setLoadDialogSource(null);
    setLoadDialogMode("load");
    setDialogPreview(null);
    setDialogPreviewLoading(false);
  };

  useEffect(() => {
    if (map) {
      setExternalSourcesLoadContext({ map });
    }
  }, [map]);

  // После гидрации IndexedDB / успешной загрузки подтягиваем meta для «Обновить».
  useEffect(() => {
    syncGbifIncrementalFromStore();
    syncInatIncrementalFromStore();
  }, [syncGbifIncrementalFromStore, syncInatIncrementalFromStore, storeRevision]);

  useEffect(() => {
    const wasLoading = wasGbifLoadingRef.current;
    wasGbifLoadingRef.current = gbifLoading;
    if (wasLoading && !gbifLoading) {
      syncGbifIncrementalFromStore();
    }
    if (gbifLoading) {
      // Чтобы повторный успех с тем же timestamp всё равно применился после full refresh.
      appliedGbifSyncedAtRef.current = null;
    }
  }, [gbifLoading, syncGbifIncrementalFromStore]);

  useEffect(() => {
    const wasLoading = wasInatLoadingRef.current;
    wasInatLoadingRef.current = inatLoading;
    if (wasLoading && !inatLoading) {
      syncInatIncrementalFromStore();
    }
    if (inatLoading) {
      appliedInatSyncedAtRef.current = null;
    }
  }, [inatLoading, syncInatIncrementalFromStore]);

  useEffect(() => {
    return subscribeExternalSourcesLoad((snap) => {
      setGbifLoading(snap.gbif.loading);
      setGbifError(snap.gbif.error);
      setGbifTotal(snap.gbif.total);
      setGbifFetched(snap.gbif.fetched);
      setGbifAdded(snap.gbif.added);
      setGbifLoaded(snap.gbif.loaded || getGbifFeatureCount());
      setGbifSeriesIndex(snap.gbif.seriesIndex);
      setGbifSeriesTotal(snap.gbif.seriesTotal);
      setGbifSeriesLabel(snap.gbif.seriesLabel);

      setInatLoading(snap.inat.loading);
      setInatError(snap.inat.error);
      setInatTotal(snap.inat.total);
      setInatFetched(snap.inat.fetched);
      setInatAdded(snap.inat.added);
      setInatLoaded(snap.inat.loaded || getInatFeatureCount());
      setInatSeriesIndex(snap.inat.seriesIndex);
      setInatSeriesTotal(snap.inat.seriesTotal);
      setInatSeriesLabel(snap.inat.seriesLabel);

      if (
        !snap.gbif.loading &&
        snap.gbif.lastSucceededSyncedAt &&
        snap.gbif.lastSucceededSyncedAt !== appliedGbifSyncedAtRef.current
      ) {
        appliedGbifSyncedAtRef.current = snap.gbif.lastSucceededSyncedAt;
        setGbifSyncedAtState(snap.gbif.lastSucceededSyncedAt);
        const successQuery =
          snap.gbif.lastSucceededQuery || getGbifLoadedQuery();
        if (successQuery) {
          setRegionId(successQuery.regionId);
          setGbifKingdomId(
            snap.gbif.lastSucceededKingdomId || successQuery.kingdomId || ""
          );
          setGbifSavedQuery(successQuery);
        }
      }

      if (
        !snap.inat.loading &&
        snap.inat.lastSucceededSyncedAt &&
        snap.inat.lastSucceededSyncedAt !== appliedInatSyncedAtRef.current
      ) {
        appliedInatSyncedAtRef.current = snap.inat.lastSucceededSyncedAt;
        setInatSyncedAtState(snap.inat.lastSucceededSyncedAt);
        const successQuery =
          snap.inat.lastSucceededQuery || getInatLoadedQuery();
        if (successQuery) {
          setRegionId(successQuery.regionId);
          setInatKingdomId(
            snap.inat.lastSucceededKingdomId || successQuery.kingdomId || ""
          );
          if (
            snap.inat.lastSucceededQualityGrade ||
            successQuery.qualityGrade
          ) {
            setInatQualityGrade(
              snap.inat.lastSucceededQualityGrade || successQuery.qualityGrade
            );
          }
          setInatSavedQuery(successQuery);
        }
      }
    });
  }, []);

  useEffect(() => {
    return () => {
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
          loadDialogMode !== "full" &&
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
        loadDialogMode !== "full" &&
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
    loadDialogMode,
    gbifLoaded,
    gbifSavedQuery,
    gbifSyncedAt,
    inatLoaded,
    inatSavedQuery,
    inatSyncedAt
  ]);

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

    await startGbifExternalLoad({
      region: loadRegion,
      kingdomId: loadKingdomId,
      extras: loadExtras,
      query: loadQuery,
      previewCount
    });
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

    await startInatExternalLoad({
      region: loadRegion,
      kingdomId: loadKingdomId,
      qualityGrade: loadQualityGrade,
      extras: loadExtras,
      query: loadQuery,
      previewCount
    });
  };

  const handleConfirmLoad = async () => {
    const source = loadDialogSource;
    if (!source || !draftRegion) {
      return;
    }

    const nextKingdomId = draftKingdomId || "";
    const nextQuality = draftQualityGrade;
    const forceFull = loadDialogMode === "full";

    if (source === "gbif") {
      const nextQuery = buildGbifQuerySnapshot(draftRegion.id, nextKingdomId || null);
      const incremental =
        !forceFull &&
        gbifLoaded > 0 &&
        isSameGbifQuery(nextQuery, gbifSavedQuery) &&
        Boolean(gbifSyncedAt);
      const extras = buildGbifLoadExtras(
        nextKingdomId,
        incremental ? withUpdateSinceExtras({}, gbifSyncedAt) : {}
      );
      closeLoadDialog();

      if (forceFull) {
        await clearGbifStoreAndPersistence();
        setGbifData(map, getGbifFeatureCollection());
        setGbifLoaded(0);
        setGbifSavedQuery(null);
        setGbifSyncedAtState(null);
        setGbifPreview(null);
        appliedGbifSyncedAtRef.current = null;
      }

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
      !forceFull &&
      inatLoaded > 0 &&
      isSameInatQuery(nextQuery, inatSavedQuery) &&
      Boolean(inatSyncedAt);
    const extras = buildInatLoadExtras(
      nextKingdomId,
      incremental ? withInatUpdateSinceExtras({}, inatSyncedAt) : {}
    );
    closeLoadDialog();

    if (forceFull) {
      await clearInatStoreAndPersistence();
      setInatData(map, getInatFeatureCollection());
      setInatLoaded(0);
      setInatSavedQuery(null);
      setInatSyncedAtState(null);
      setInatPreview(null);
      appliedInatSyncedAtRef.current = null;
    }

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
    loadDialogMode !== "full" &&
    (loadDialogSource === "gbif"
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
        : false);

  const gbifSeriesEstimate =
    gbifPreview != null ? estimateGbifLoadSeriesCount(gbifPreview) : null;
  const gbifMultiSeriesLoad =
    gbifPreview != null && gbifPreview > GBIF_SERIES_SOFT_LIMIT && !gbifIncremental;
  const inatSeriesEstimate =
    inatPreview != null ? estimateInatLoadSeriesCount(inatPreview) : null;
  const inatMultiSeriesLoad =
    inatPreview != null && inatPreview > INAT_API_RESULT_LIMIT && !inatIncremental;
  const dialogSeriesEstimate =
    dialogPreview == null
      ? null
      : loadDialogSource === "gbif"
        ? estimateGbifLoadSeriesCount(dialogPreview)
        : estimateInatLoadSeriesCount(dialogPreview);
  const dialogMultiSeries =
    dialogPreview != null &&
    !dialogIncremental &&
    ((loadDialogSource === "gbif" && dialogPreview > GBIF_SERIES_SOFT_LIMIT) ||
      (loadDialogSource === "inat" && dialogPreview > INAT_API_RESULT_LIMIT));

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
            {gbifMultiSeriesLoad ? (
              <p className="gbif-panel-hint">
                Находок больше {formatCount(GBIF_SERIES_SOFT_LIMIT)} — загрузка пойдёт
                сериями (≈ {formatCount(gbifSeriesEstimate)} и более) по годам, при
                необходимости по месяцам, и отдельно по датасетам для записей без года.
                Все серии объединяются в одну локальную копию.
              </p>
            ) : null}
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
                seriesIndex={gbifSeriesIndex}
                seriesTotal={gbifSeriesTotal}
                seriesLabel={gbifSeriesLabel}
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
                disabled={!map || gbifLoading || gbifLoaded === 0}
                title="Очистить локальную копию и загрузить заново"
                onClick={() => openLoadDialog("gbif", "full")}
              >
                Полностью обновить
              </button>
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                disabled={!gbifLoading}
                onClick={() => cancelGbifExternalLoad()}
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
                disabled={!map || inatLoading || inatLoaded === 0}
                title="Очистить локальную копию и загрузить заново"
                onClick={() => openLoadDialog("inat", "full")}
              >
                Полностью обновить
              </button>
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                disabled={!inatLoading}
                onClick={() => cancelInatExternalLoad()}
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
            Работа с данными
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
                ? loadDialogMode === "full"
                  ? "Полностью обновить GBIF"
                  : dialogIncremental
                    ? "Обновить GBIF"
                    : "Загрузить GBIF"
                : loadDialogMode === "full"
                  ? "Полностью обновить iNaturalist"
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
              {loadDialogMode === "full"
                ? "Текущая локальная копия будет удалена и заменена полной загрузкой."
                : "Данные сохранятся локально и добавятся к уже загруженным (дубликаты обновятся)."}
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
                {loadDialogMode === "full"
                  ? "Полностью обновить"
                  : dialogIncremental
                    ? "Обновить"
                    : "Загрузить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
