import React, { useEffect, useMemo, useRef, useState } from "react";
import { clearGbifLayer, setGbifData, setGbifMapUpdatesPaused } from "./addGbifLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  GBIF_PAGE_SIZE,
  getGbifNetworkErrorMessage,
  isGbifAbortError,
  loadOccurrencesForRegion,
  previewOccurrenceCount,
  withUpdateSinceExtras
} from "../gbif/gbifClient";
import {
  getGbifFeatureCount,
  getGbifLoadedQuery,
  getGbifLoadedRegionId,
  getGbifSlimMapCollection,
  getGbifSyncedAt,
  setGbifLoadedQuery,
  setGbifSyncedAt,
  upsertGbifFeatures
} from "../gbif/gbifStore";
import { persistGbifSnapshot } from "../gbif/gbifPersistence";
import {
  DEFAULT_GBIF_REGION_ID,
  GBIF_REGIONS,
  getGbifRegionById
} from "../gbif/regions";
import "../styles/GbifPanel.css";

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(value);
}

function buildQuerySnapshot(regionId) {
  return { regionId };
}

/**
 * Сравнивает запросы загрузки: только регион.
 * Старые снимки с фильтрами таксонов не считаются совпадением — нужна полная загрузка.
 */
function isSameGbifQuery(a, b) {
  if (!a || !b || a.regionId !== b.regionId) {
    return false;
  }

  if (
    b.kingdomId ||
    b.familySelected ||
    b.taxonSelected ||
    (b.familyQuery || "").trim() ||
    (b.taxonQuery || "").trim()
  ) {
    return false;
  }

  return true;
}

/** Грубая оценка размера снимка в IndexedDB (~400 байт на точку). */
function formatEstimatedSize(count) {
  if (count == null || !Number.isFinite(count) || count <= 0) {
    return null;
  }

  const bytes = count * 400;
  if (bytes < 1024 * 1024) {
    return `≈ ${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }

  return `≈ ${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function getInitialRegionId() {
  const savedQuery = getGbifLoadedQuery();
  return getGbifLoadedRegionId() || savedQuery?.regionId || DEFAULT_GBIF_REGION_ID;
}

/** Панель загрузки находок GBIF на отдельный слой карты. */
export default function GbifPanel({
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
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(getGbifFeatureCount);
  const [total, setTotal] = useState(null);
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [updateAdded, setUpdateAdded] = useState(0);
  const [updateFetched, setUpdateFetched] = useState(0);
  const [syncedAt, setSyncedAtState] = useState(() => getGbifSyncedAt());
  const [savedQuery, setSavedQuery] = useState(() => getGbifLoadedQuery());
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abortRef = useRef(null);
  const previewAbortRef = useRef(null);

  const region = getGbifRegionById(regionId);
  const hasDataset = loaded > 0;

  const currentQuery = useMemo(() => buildQuerySnapshot(regionId), [regionId]);

  const sameAsLoadedQuery = useMemo(
    () => isSameGbifQuery(currentQuery, savedQuery),
    [currentQuery, savedQuery]
  );

  const incrementalUpdate = hasDataset && sameAsLoadedQuery && Boolean(syncedAt);

  const requestExtras = useMemo(
    () => (incrementalUpdate ? withUpdateSinceExtras({}, syncedAt) : {}),
    [incrementalUpdate, syncedAt]
  );

  const canLoad = Boolean(map && region && !loading);
  const estimatedSizeLabel = formatEstimatedSize(previewCount);

  const confirmDetails = useMemo(() => {
    const rows = [{ label: "Регион", value: region?.label ?? regionId }];

    rows.push({
      label: "Объём",
      value:
        previewCount != null
          ? incrementalUpdate
            ? `≈ ${formatCount(previewCount)} обновлений${
                estimatedSizeLabel ? ` (${estimatedSizeLabel})` : ""
              }`
            : `≈ ${formatCount(previewCount)} находок (~${formatCount(
                Math.ceil(previewCount / GBIF_PAGE_SIZE)
              )} стр.)${estimatedSizeLabel ? `, ${estimatedSizeLabel}` : ""}`
          : incrementalUpdate
            ? "объём обновлений уточнится во время загрузки"
            : "объём уточнится во время загрузки"
    });

    if (hasDataset) {
      rows.push({
        label: "Уже на карте",
        value: incrementalUpdate
          ? `${formatCount(loaded)} находок (подтянутся только новые/изменённые)`
          : `${formatCount(loaded)} находок (новые добавятся, дубликаты обновятся)`
      });
    }

    return rows;
  }, [
    region,
    regionId,
    previewCount,
    estimatedSizeLabel,
    hasDataset,
    loaded,
    incrementalUpdate
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      previewAbortRef.current?.abort();
    };
  }, []);

  // Оценка числа точек до загрузки по выбранному региону.
  useEffect(() => {
    if (!region) {
      setPreviewCount(null);
      return undefined;
    }

    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewLoading(true);

    const timer = window.setTimeout(() => {
      previewOccurrenceCount(region, { signal: controller.signal, extras: requestExtras })
        .then((count) => {
          if (!controller.signal.aborted) {
            setPreviewCount(count);
          }
        })
        .catch((err) => {
          if (!isGbifAbortError(err, controller.signal)) {
            setPreviewCount(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setPreviewLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [region, requestExtras]);

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const notifyDataChange = () => {
    onDataChange?.();
  };

  const handleLoadClick = () => {
    if (!canLoad) {
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
  };

  const handleLoad = async () => {
    if (!canLoad) {
      return;
    }

    setConfirmOpen(false);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const querySnapshot = currentQuery;

    setError(null);
    setLoading(true);
    setTotal(previewCount);
    setUpdateAdded(0);
    setUpdateFetched(0);

    setGbifMapUpdatesPaused(true);
    clearGbifLayer(map);

    let addedTotal = 0;
    let fetchedTotal = 0;

    try {
      await loadOccurrencesForRegion(region, {
        signal: controller.signal,
        extras: requestExtras,
        onPage: (features) => {
          fetchedTotal += features.length;
          setUpdateFetched(fetchedTotal);

          const { added } = upsertGbifFeatures(features, region.id);
          addedTotal += added;
          setUpdateAdded(addedTotal);
          setLoaded(getGbifFeatureCount());
        },
        onProgress: ({ total: nextTotal }) => {
          if (typeof nextTotal === "number") {
            setTotal(nextTotal);
          }
        }
      });
    } catch (err) {
      if (isGbifAbortError(err, controller.signal)) {
        setError(null);
      } else {
        setError(getGbifNetworkErrorMessage(err));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setGbifMapUpdatesPaused(false);
      setGbifData(map, getGbifSlimMapCollection());
      const nextSyncedAt = new Date().toISOString();
      setLoading(false);
      setLoaded(getGbifFeatureCount());
      setGbifLoadedQuery(querySnapshot);
      setSavedQuery(querySnapshot);
      setGbifSyncedAt(nextSyncedAt);
      setSyncedAtState(nextSyncedAt);
      await persistGbifSnapshot();
      notifyDataChange();
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div className={`feature-popup gbif-panel ${collapsed ? "feature-popup--collapsed" : ""}`}>
      <div className="feature-popup-header">
        <h3 className="feature-popup-title">Данные GBIF</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          {onCollapsedChange && (
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
          )}
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
      </div>

      {collapsed ? (
        <p className="popup-collapsed-summary">
          {loading
            ? `Загрузка… +${formatCount(updateAdded)} · ${formatCount(loaded)}`
            : loaded > 0
              ? `На слое: ${formatCount(loaded)}`
              : "Слой пуст"}
        </p>
      ) : (
        <div className="gbif-panel-content">
          <p className="gbif-panel-hint">
            Внешние находки GBIF на отдельном слое карты. Выберите регион и нажмите
            «Загрузить» — точки сохранятся локально и добавятся к уже загруженным
            (дубликаты по GBIF ID обновятся). Фильтры по царству, семейству и латыни —
            в панели «Обработка данных GBIF».
          </p>

          <label className="gbif-panel-field" htmlFor="gbif-region-select">
            <span className="gbif-panel-label">Регион</span>
            <select
              id="gbif-region-select"
              className="gbif-panel-select"
              value={regionId}
              disabled={loading}
              onChange={(event) => setRegionId(event.target.value)}
            >
              {GBIF_REGIONS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div
            className={`gbif-panel-status${loading ? " gbif-panel-status--loading" : ""}`}
            aria-live="polite"
          >
            {loading ? (
              <dl className="gbif-panel-status-list">
                <div className="gbif-panel-status-row">
                  <dt>Получено</dt>
                  <dd>
                    <strong>{formatCount(updateFetched)}</strong>
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
                    <strong>{formatCount(updateAdded)}</strong>
                  </dd>
                </div>
                <div className="gbif-panel-status-row">
                  <dt>На слое</dt>
                  <dd>
                    <strong>{formatCount(loaded)}</strong>
                  </dd>
                </div>
              </dl>
            ) : previewLoading ? (
              <p className="gbif-panel-status-text">
                {incrementalUpdate ? "Оценка обновлений…" : "Оценка числа находок…"}
              </p>
            ) : hasDataset || previewCount != null ? (
              <dl className="gbif-panel-status-list">
                {hasDataset ? (
                  <div className="gbif-panel-status-row">
                    <dt>На слое</dt>
                    <dd>
                      <strong>{formatCount(loaded)}</strong>
                    </dd>
                  </div>
                ) : null}
                {hasDataset && syncedAt ? (
                  <div className="gbif-panel-status-row">
                    <dt>Синхронизация</dt>
                    <dd>{new Date(syncedAt).toLocaleString("ru-RU")}</dd>
                  </div>
                ) : null}
                {previewCount != null ? (
                  <div className="gbif-panel-status-row">
                    <dt>{incrementalUpdate ? "Обновлений" : "По региону"}</dt>
                    <dd>
                      ≈ <strong>{formatCount(previewCount)}</strong>
                      {!incrementalUpdate ? (
                        <>
                          {" "}
                          (~{formatCount(Math.ceil(previewCount / GBIF_PAGE_SIZE))} стр.)
                        </>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="gbif-panel-status-text">
                Выберите регион, чтобы увидеть оценку
              </p>
            )}
            {loading ? (
              <div
                className={`gbif-panel-status-track${
                  total == null || total <= 0
                    ? " gbif-panel-status-track--indeterminate"
                    : ""
                }`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  total != null && total > 0
                    ? Math.min(100, Math.round((loaded / total) * 100))
                    : undefined
                }
                aria-label="Прогресс загрузки GBIF"
              >
                <div
                  className="gbif-panel-status-bar"
                  style={{
                    width:
                      total != null && total > 0
                        ? `${Math.min(100, (loaded / total) * 100)}%`
                        : "40%"
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="gbif-panel-actions">
            <button
              type="button"
              className="gbif-panel-btn"
              disabled={!canLoad}
              onClick={handleLoadClick}
            >
              {incrementalUpdate ? "Обновить" : "Загрузить"}
            </button>
            <button
              type="button"
              className="gbif-panel-btn gbif-panel-btn--secondary"
              disabled={!loading}
              onClick={handleCancel}
            >
              Отменить
            </button>
          </div>

          {error && <p className="gbif-panel-error">{error}</p>}

          <button
            type="button"
            className="gbif-panel-btn gbif-panel-btn--processing"
            onClick={() => onOpenProcessing?.()}
          >
            Обработка данных GBIF
          </button>
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.GBIF} open={helpOpen} />

      {confirmOpen && (
        <div className="gbif-confirm-overlay" onClick={handleConfirmClose}>
          <div
            className="gbif-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gbif-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="gbif-confirm-title" className="gbif-confirm-title">
              {incrementalUpdate ? "Подтверждение обновления" : "Подтверждение загрузки"}
            </h4>
            <p className="gbif-confirm-text">
              {incrementalUpdate
                ? "Подтянуть только новые и изменённые записи GBIF с момента последней синхронизации? Уже сохранённые точки останутся."
                : "Загрузить все находки GBIF по выбранному региону на этот компьютер? Они сохранятся в локальном хранилище браузера и добавятся к уже загруженным точкам (совпадения по GBIF ID будут обновлены)."}
            </p>
            <dl className="gbif-confirm-details">
              {confirmDetails.map(({ label, value }) => (
                <div key={label} className="gbif-confirm-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="gbif-confirm-actions">
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary"
                onClick={handleConfirmClose}
              >
                Отмена
              </button>
              <button type="button" className="gbif-panel-btn" onClick={handleLoad}>
                {incrementalUpdate ? "Обновить" : "Загрузить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
