import React, { useEffect, useMemo, useRef, useState } from "react";
import { setGbifData } from "./addGbifLayer";
import { setInatData } from "./addInatLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
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
import "../styles/GbifPanel.css";

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(value);
}


function buildGbifQuerySnapshot(regionId) {
  return { regionId };
}

function buildInatQuerySnapshot(regionId, qualityGrade) {
  return { regionId, qualityGrade };
}

function isSameGbifQuery(a, b) {
  return Boolean(a && b && a.regionId === b.regionId);
}

function isSameInatQuery(a, b) {
  return Boolean(
    a &&
      b &&
      a.regionId === b.regionId &&
      (a.qualityGrade ?? INAT_QUALITY_MODES.RESEARCH) ===
        (b.qualityGrade ?? INAT_QUALITY_MODES.RESEARCH)
  );
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
  onDataChange,
  onOpenProcessing
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [regionId, setRegionId] = useState(getInitialRegionId);
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
  const [confirmSource, setConfirmSource] = useState(null);

  const gbifAbortRef = useRef(null);
  const inatAbortRef = useRef(null);
  const gbifPreviewAbortRef = useRef(null);
  const inatPreviewAbortRef = useRef(null);

  const region = getExternalRegionById(regionId);
  const gbifQuery = useMemo(() => buildGbifQuerySnapshot(regionId), [regionId]);
  const inatQuery = useMemo(
    () => buildInatQuerySnapshot(regionId, inatQualityGrade),
    [regionId, inatQualityGrade]
  );

  const gbifIncremental =
    gbifLoaded > 0 && isSameGbifQuery(gbifQuery, gbifSavedQuery) && Boolean(gbifSyncedAt);
  const inatIncremental =
    inatLoaded > 0 && isSameInatQuery(inatQuery, inatSavedQuery) && Boolean(inatSyncedAt);

  const gbifRequestExtras = useMemo(
    () => (gbifIncremental ? withUpdateSinceExtras({}, gbifSyncedAt) : {}),
    [gbifIncremental, gbifSyncedAt]
  );
  const inatRequestExtras = useMemo(
    () => (inatIncremental ? withInatUpdateSinceExtras({}, inatSyncedAt) : {}),
    [inatIncremental, inatSyncedAt]
  );

  const loading = gbifLoading || inatLoading;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  useEffect(() => {
    return () => {
      gbifAbortRef.current?.abort();
      inatAbortRef.current?.abort();
      gbifPreviewAbortRef.current?.abort();
      inatPreviewAbortRef.current?.abort();
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

  const notifyDataChange = () => {
    onDataChange?.();
  };

  const runGbifLoad = async () => {
    if (!map || !region) {
      return;
    }

    gbifAbortRef.current?.abort();
    const controller = new AbortController();
    gbifAbortRef.current = controller;

    setGbifError(null);
    setGbifLoading(true);
    setGbifTotal(gbifPreview);
    setGbifAdded(0);
    setGbifFetched(0);

    let pagesSinceMapUpdate = 0;
    let addedTotal = 0;
    let fetchedTotal = 0;

    try {
      await loadOccurrencesForRegion(region, {
        signal: controller.signal,
        extras: gbifRequestExtras,
        onPage: (features) => {
          fetchedTotal += features.length;
          setGbifFetched(fetchedTotal);
          const { collection, added } = upsertGbifFeatures(features, region.id);
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
      const nextSyncedAt = new Date().toISOString();
      setGbifLoading(false);
      setGbifLoaded(getGbifFeatureCount());
      setGbifLoadedQuery(gbifQuery);
      setGbifSavedQuery(gbifQuery);
      setGbifSyncedAt(nextSyncedAt);
      setGbifSyncedAtState(nextSyncedAt);
      await persistGbifSnapshot();
      notifyDataChange();
    }
  };

  const runInatLoad = async () => {
    if (!map || !region) {
      return;
    }

    inatAbortRef.current?.abort();
    const controller = new AbortController();
    inatAbortRef.current = controller;

    setInatError(null);
    setInatLoading(true);
    setInatTotal(inatPreview);
    setInatAdded(0);
    setInatFetched(0);
    setInatSeriesIndex(null);
    setInatSeriesTotal(
      inatPreview != null ? estimateInatLoadSeriesCount(inatPreview) : null
    );
    setInatSeriesLabel(null);

    let pagesSinceMapUpdate = 0;
    let addedTotal = 0;
    let fetchedTotal = 0;

    try {
      await loadObservationsInSeries(region, {
        signal: controller.signal,
        qualityGrade: inatQualityGrade,
        extras: inatRequestExtras,
        previewCount: inatPreview,
        onSeriesStart: ({ series, index, planned, queued }) => {
          setInatSeriesIndex(index);
          setInatSeriesTotal(Math.max(planned, queued, index));
          setInatSeriesLabel(series.label);
        },
        onPage: (features) => {
          fetchedTotal += features.length;
          setInatFetched(fetchedTotal);
          const { collection, added } = upsertInatFeatures(features, region.id);
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
      const nextSyncedAt = new Date().toISOString();
      setInatLoading(false);
      setInatSeriesIndex(null);
      setInatSeriesTotal(null);
      setInatSeriesLabel(null);
      setInatLoaded(getInatFeatureCount());
      setInatLoadedQuery(inatQuery);
      setInatSavedQuery(inatQuery);
      setInatSyncedAt(nextSyncedAt);
      setInatSyncedAtState(nextSyncedAt);
      await persistInatSnapshot();
      notifyDataChange();
    }
  };

  const handleConfirmLoad = async () => {
    const source = confirmSource;
    setConfirmSource(null);
    if (source === "gbif") {
      await runGbifLoad();
    } else if (source === "inat") {
      await runInatLoad();
    }
  };

  const inatSeriesEstimate =
    inatPreview != null ? estimateInatLoadSeriesCount(inatPreview) : null;
  const inatMultiSeriesLoad =
    inatPreview != null && inatPreview > INAT_API_RESULT_LIMIT && !inatIncremental;

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
          <p className="gbif-panel-hint">
            Загрузка находок из GBIF и iNaturalist на отдельные слои карты. После
            загрузки карта, фильтры и popup работают только с локальной копией в
            браузере (IndexedDB); к API обращаются лишь кнопки «Загрузить» и
            «Обновить». Фильтры по таксонам — в панели «Обработка внешних данных».
          </p>

          <label className="gbif-panel-field" htmlFor="data-sources-region">
            <span className="gbif-panel-label">Регион</span>
            <select
              id="data-sources-region"
              className="gbif-panel-select"
              value={regionId}
              disabled={loading}
              onChange={(event) => setRegionId(event.target.value)}
            >
              {EXTERNAL_REGIONS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

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
                disabled={!map || !region || gbifLoading}
                onClick={() => setConfirmSource("gbif")}
              >
                {gbifIncremental ? "Обновить GBIF" : "Загрузить GBIF"}
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
            <label className="gbif-panel-field" htmlFor="inat-quality-grade">
              <span className="gbif-panel-label">Качество наблюдений</span>
              <select
                id="inat-quality-grade"
                className="gbif-panel-select"
                value={inatQualityGrade}
                disabled={inatLoading}
                onChange={(event) => setInatQualityGrade(event.target.value)}
              >
                {INAT_QUALITY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
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
                disabled={!map || !region || inatLoading}
                onClick={() => setConfirmSource("inat")}
              >
                {inatIncremental ? "Обновить iNaturalist" : "Загрузить iNaturalist"}
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

      {confirmSource && (
        <div className="gbif-confirm-overlay" onClick={() => setConfirmSource(null)}>
          <div
            className="gbif-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-sources-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="data-sources-confirm-title" className="gbif-confirm-title">
              {confirmSource === "gbif"
                ? gbifIncremental
                  ? "Обновить данные GBIF?"
                  : "Загрузить данные GBIF?"
                : inatIncremental
                  ? "Обновить данные iNaturalist?"
                  : "Загрузить данные iNaturalist?"}
            </h4>
            <p className="gbif-confirm-text">
              Регион: {region?.label ?? regionId}. Данные сохранятся локально и добавятся к
              уже загруженным (дубликаты обновятся).
              {confirmSource === "inat" && inatMultiSeriesLoad
                ? ` Загрузка iNaturalist будет выполнена сериями (≈ ${formatCount(inatSeriesEstimate)}).`
                : null}
            </p>
            <div className="gbif-confirm-actions">
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                onClick={() => setConfirmSource(null)}
              >
                Отмена
              </button>
              <button type="button" className="gbif-panel-btn" onClick={handleConfirmLoad}>
                {confirmSource === "gbif"
                  ? gbifIncremental
                    ? "Обновить"
                    : "Загрузить"
                  : inatIncremental
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
