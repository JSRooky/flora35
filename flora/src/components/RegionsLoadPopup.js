import React, { useCallback } from "react";
import RegionsLoadTable from "./RegionsLoadTable";
import {
  cancelGbifExternalLoad,
  cancelInatExternalLoad
} from "../externalSources/externalSourcesLoadManager";
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
  onLoadError
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
        <p className="regions-load-hint">
          Кликайте по числам царств, чтобы выбрать одно или несколько (пусто —
          все). Затем «Загрузить» / «Обновить». Источник: GBIF или iNaturalist.
        </p>

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

        <RegionsLoadTable map={map} onLoadError={onLoadError} />
      </div>
    </div>
  );
}
