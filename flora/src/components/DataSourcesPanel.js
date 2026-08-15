import React, { useCallback, useEffect, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import RegionsLoadPopup from "./RegionsLoadPopup";
import RegionsFilterPopup from "./RegionsFilterPopup";
import SelectiveLoadPopup from "./SelectiveLoadPopup";
import { getGbifFeatureCount, getGbifLoadedRegionIds, getGbifPackedBytes } from "../gbif/gbifStore";
import {
  getInatFeatureCount,
  getInatLoadedRegionIds,
  getInatPackedBytes
} from "../inaturalist/inatStore";
import { EXTERNAL_REGIONS } from "../externalSources/regions";
import {
  getExternalSourcesLoadSnapshot,
  subscribeExternalSourcesLoad,
  clearAllExternalDatasets,
  isExternalSourcesLoadActive
} from "../externalSources/externalSourcesLoadManager";
import "../styles/GbifPanel.css";
import { DownloadIcon, FilterIcon, TrashIcon } from "../images/buttons";

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Number(value));
}

function formatMegabytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 МБ";
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    return `${mb.toFixed(2)} МБ`;
  }
  return `${mb.toFixed(1)} МБ`;
}


function getLoadedRegionIds() {
  const ids = new Set();
  getGbifLoadedRegionIds().forEach((id) => ids.add(id));
  getInatLoadedRegionIds().forEach((id) => ids.add(id));
  return ids;
}

function getLoadedDataStats() {
  const gbifCount = getGbifFeatureCount();
  const inatCount = getInatFeatureCount();
  const pointCount = gbifCount + inatCount;
  const bytes = getGbifPackedBytes() + getInatPackedBytes();

  return {
    pointCount,
    bytes,
    regionCount: getLoadedRegionIds().size
  };
}

/**
 * Панель «Источники данных»: сводка локальной копии.
 * Таблица регионов открывается отдельным плавающим окном.
 */
export default function DataSourcesPanel({
  map,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose,
  storeRevision = 0,
  hiddenRegionIds = [],
  onHiddenRegionIdsChange,
  onTempLayersChange
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [regionsTableOpen, setRegionsTableOpen] = useState(false);
  const [selectiveTableOpen, setSelectiveTableOpen] = useState(false);
  const [regionsFilterOpen, setRegionsFilterOpen] = useState(false);
  const [loadSnapshot, setLoadSnapshot] = useState(() => getExternalSourcesLoadSnapshot());
  const [stats, setStats] = useState(() => getLoadedDataStats());
  const [loadError, setLoadError] = useState(null);
  const [clearing, setClearing] = useState(false);

  const loading = Boolean(loadSnapshot.gbif.loading || loadSnapshot.inat.loading);
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  const refreshStats = useCallback(() => {
    setStats(getLoadedDataStats());
  }, []);

  useEffect(() => {
    return subscribeExternalSourcesLoad((snap) => {
      setLoadSnapshot(snap);
      setStats(getLoadedDataStats());
      const error = snap.gbif.error || snap.inat.error;
      if (error) {
        setLoadError(error);
      }
    });
  }, []);

  useEffect(() => {
    refreshStats();
  }, [storeRevision, refreshStats]);

  const handleClearAll = useCallback(async () => {
    if (loading || clearing || isExternalSourcesLoadActive()) {
      return;
    }
    if (stats.pointCount <= 0) {
      return;
    }
    const confirmed = window.confirm(
      "Удалить все загруженные данные GBIF и iNaturalist? Точки пропадут с карты и из локальной копии. После этого регионы можно загрузить заново."
    );
    if (!confirmed) {
      return;
    }

    setClearing(true);
    setLoadError(null);
    try {
      await clearAllExternalDatasets();
      onHiddenRegionIdsChange?.([]);
      setStats(getLoadedDataStats());
    } catch (error) {
      setLoadError(error?.message || "Не удалось очистить данные");
    } finally {
      setClearing(false);
    }
  }, [clearing, loading, onHiddenRegionIdsChange, stats.pointCount]);

  const loadedRegionIdsForFilter = getLoadedRegionIds();
  const pendingRegionCount = EXTERNAL_REGIONS.filter(
    (region) => !loadedRegionIdsForFilter.has(region.id)
  ).length;
  const updates = {
    regionCount: pendingRegionCount,
    recordCount: pendingRegionCount > 0 ? null : 0
  };

  const collapsedSummary = loading
    ? "Загрузка регионов…"
    : `${formatCount(stats.pointCount)} точ. · ${formatMegabytes(stats.bytes)}`;

  return (
    <>
      <div
        className={`feature-popup gbif-panel${collapsed ? " feature-popup--collapsed" : ""}`}
      >
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
          <p className="popup-collapsed-summary">{collapsedSummary}</p>
        ) : (
          <div className="gbif-panel-content">
            <section className="data-sources-summary" aria-label="Загрузка по регионам">
              <h4 className="data-sources-summary-title">Загрузка по регионам</h4>
              <div className="data-sources-actions">
                <button
                  type="button"
                  className="gbif-panel-btn data-sources-action-btn"
                  disabled={!map}
                  title="Загрузить"
                  aria-label="Загрузить"
                  onClick={() => {
                    setLoadError(null);
                    setRegionsTableOpen(true);
                  }}
                >
                  <DownloadIcon className="data-sources-action-icon" aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className="gbif-panel-btn gbif-panel-btn--secondary data-sources-action-btn"
                  disabled={!map}
                  title="Фильтр"
                  aria-label="Фильтр"
                  onClick={() => setRegionsFilterOpen(true)}
                >
                  <FilterIcon className="data-sources-action-icon" aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className="gbif-panel-btn data-sources-action-btn data-sources-action-btn--danger"
                  disabled={!map || loading || clearing || stats.pointCount <= 0}
                  title="Очистить все"
                  aria-label="Очистить все"
                  onClick={handleClearAll}
                >
                  {clearing ? (
                    <span className="data-sources-action-busy" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <TrashIcon className="data-sources-action-icon" aria-hidden="true" focusable="false" />
                  )}
                </button>
              </div>
              <button
                type="button"
                className="gbif-panel-btn gbif-panel-btn--secondary data-sources-selective-btn"
                disabled={!map}
                onClick={() => {
                  setLoadError(null);
                  setSelectiveTableOpen(true);
                }}
              >
                Выборочная загрузка
              </button>
            </section>

            {loading ? (
              <p className="gbif-panel-hint">
                Идёт загрузка
                {loadSnapshot.gbif.loading ? " GBIF" : ""}
                {loadSnapshot.gbif.loading && loadSnapshot.inat.loading ? " и" : ""}
                {loadSnapshot.inat.loading ? " iNaturalist" : ""}
                …
              </p>
            ) : null}

            {loadError && !regionsTableOpen && !selectiveTableOpen ? (
              <p className="gbif-panel-error">{loadError}</p>
            ) : null}

            <section className="data-sources-summary" aria-label="Загруженные данные">
              <h4 className="data-sources-summary-title">Загруженные данные</h4>
              <dl className="data-sources-summary-list">
                <div className="data-sources-summary-row">
                  <dt>Регионов</dt>
                  <dd>{formatCount(stats.regionCount)}</dd>
                </div>
                <div className="data-sources-summary-row">
                  <dt>Точек</dt>
                  <dd>{formatCount(stats.pointCount)}</dd>
                </div>
                <div className="data-sources-summary-row">
                  <dt>Объём</dt>
                  <dd>{formatMegabytes(stats.bytes)}</dd>
                </div>
              </dl>
            </section>

            <section className="data-sources-summary" aria-label="Наличие обновлений">
              <h4 className="data-sources-summary-title">Наличие обновлений</h4>
              <p className="data-sources-summary-line">
                Регионов — {formatCount(updates.regionCount)}, записей —{" "}
                {updates.recordCount == null ? "—" : formatCount(updates.recordCount)}
              </p>
            </section>
          </div>
        )}

        <ModuleHelpPanel sectionId={MODULE_IDS.DATA_SOURCES} open={helpOpen} />
      </div>

      <RegionsLoadPopup
        open={regionsTableOpen}
        map={map}
        loading={loading}
        loadSnapshot={loadSnapshot}
        loadError={loadError}
        onClose={() => setRegionsTableOpen(false)}
        onLoadError={setLoadError}
      />
      <SelectiveLoadPopup
        open={selectiveTableOpen}
        map={map}
        loading={loading}
        loadSnapshot={loadSnapshot}
        loadError={loadError}
        onClose={() => setSelectiveTableOpen(false)}
        onLoadError={setLoadError}
        onTempLayersChange={onTempLayersChange}
      />
      <RegionsFilterPopup
        open={regionsFilterOpen}
        loadedRegionIds={loadedRegionIdsForFilter}
        hiddenRegionIds={hiddenRegionIds}
        onHiddenRegionIdsChange={onHiddenRegionIdsChange}
        onClose={() => setRegionsFilterOpen(false)}
      />
    </>
  );
}
