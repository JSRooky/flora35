import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import RegionsLoadPopup from "./RegionsLoadPopup";
import { getGbifFeatureCollection, getGbifFeatureCount, getGbifLoadedRegionId } from "../gbif/gbifStore";
import {
  getInatFeatureCollection,
  getInatFeatureCount,
  getInatLoadedRegionId
} from "../inaturalist/inatStore";
import { EXTERNAL_REGIONS } from "../externalSources/regions";
import {
  getExternalSourcesLoadSnapshot,
  subscribeExternalSourcesLoad
} from "../externalSources/externalSourcesLoadManager";
import "../styles/GbifPanel.css";

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

function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

function getLoadedRegionIds() {
  const ids = new Set();
  const gbifRegionId = getGbifLoadedRegionId();
  const inatRegionId = getInatLoadedRegionId();
  if (gbifRegionId) {
    ids.add(gbifRegionId);
  }
  if (inatRegionId) {
    ids.add(inatRegionId);
  }
  return ids;
}

function getLoadedDataStats() {
  const gbifCount = getGbifFeatureCount();
  const inatCount = getInatFeatureCount();
  const pointCount = gbifCount + inatCount;
  const bytes =
    estimateJsonBytes(getGbifFeatureCollection()) +
    estimateJsonBytes(getInatFeatureCollection());

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
  storeRevision = 0
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [regionsTableOpen, setRegionsTableOpen] = useState(false);
  const [loadSnapshot, setLoadSnapshot] = useState(() => getExternalSourcesLoadSnapshot());
  const [stats, setStats] = useState(() => getLoadedDataStats());
  const [loadError, setLoadError] = useState(null);

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

  const updates = useMemo(() => {
    void storeRevision;
    void loadSnapshot.gbif.loaded;
    void loadSnapshot.inat.loaded;
    void stats.pointCount;

    const loadedIds = getLoadedRegionIds();
    const pendingRegions = EXTERNAL_REGIONS.filter((region) => !loadedIds.has(region.id));
    return {
      regionCount: pendingRegions.length,
      recordCount: pendingRegions.length > 0 ? null : 0
    };
  }, [storeRevision, loadSnapshot.gbif.loaded, loadSnapshot.inat.loaded, stats.pointCount]);

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
            <div className="gbif-panel-actions">
              <button
                type="button"
                className="gbif-panel-btn"
                disabled={!map}
                onClick={() => {
                  setLoadError(null);
                  setRegionsTableOpen(true);
                }}
              >
                Загрузить регионы
              </button>
            </div>

            {loading ? (
              <p className="gbif-panel-hint">
                Идёт загрузка
                {loadSnapshot.gbif.loading ? " GBIF" : ""}
                {loadSnapshot.gbif.loading && loadSnapshot.inat.loading ? " и" : ""}
                {loadSnapshot.inat.loading ? " iNaturalist" : ""}
                …
              </p>
            ) : null}

            {loadError && !regionsTableOpen ? (
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
    </>
  );
}
