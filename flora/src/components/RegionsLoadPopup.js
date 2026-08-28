import React, { useCallback } from "react";
import RegionsLoadTable from "./RegionsLoadTable";
import {
  cancelGbifExternalLoad,
  cancelInatExternalLoad
} from "../externalSources/externalSourcesLoadManager";
import PanelHint from "./PanelHint";
import "../styles/RegionsLoadPopup.css";
import "../styles/GbifPanel.css";

/**
 * Плавающее окно таблицы загрузки регионов России
 * (как NearSpeciesMatches / UndoMergedPoints).
 */
export default function RegionsLoadPopup({
  open = false,
  map = null,
  loading = false,
  loadSnapshot = null,
  loadError = null,
  onClose,
  onLoadError,
  focusRegions = null,
  spatialByRegionId = null,
  unmatchedLabels = [],
  onTempLayersChange
}) {
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleCancelLoad = useCallback(() => {
    cancelGbifExternalLoad();
    cancelInatExternalLoad();
  }, []);

  if (!open) {
    return null;
  }

  const seriesLabel =
    loadSnapshot?.gbif?.seriesLabel || loadSnapshot?.inat?.seriesLabel || null;

  return (
    <div className="regions-load-overlay" onClick={handleClose}>
      <div
        className="regions-load-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Регионы России"
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
        <h3 className="regions-load-title">Регионы России</h3>
        <PanelHint>
          {Array.isArray(focusRegions) && focusRegions.length > 0
            ? `Показаны выбранные субъекты (${focusRegions.length}). Кликайте по числам царств, затем «Загрузить».`
            : "Клик по числу царства — фильтр (пусто = все). Затем загрузка или обновление."}
          {unmatchedLabels.length > 0
            ? ` Не сопоставлены с базами: ${unmatchedLabels.join(", ")}.`
            : ""}
        </PanelHint>

        {loading ? (
          <div className="regions-load-progress">
            <p className="regions-load-progress-text">
              Идёт загрузка
              {loadSnapshot?.gbif?.loading ? " GBIF" : ""}
              {loadSnapshot?.gbif?.loading && loadSnapshot?.inat?.loading
                ? " и"
                : ""}
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

        <RegionsLoadTable
          map={map}
          onLoadError={onLoadError}
          regions={focusRegions}
          spatialByRegionId={spatialByRegionId}
          onTempLayersChange={onTempLayersChange}
        />
      </div>
    </div>
  );
}
