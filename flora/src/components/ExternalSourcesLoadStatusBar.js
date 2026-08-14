import React, { useEffect, useState } from "react";
import {
  cancelGbifExternalLoad,
  cancelInatExternalLoad,
  getExternalSourcesLoadSnapshot,
  subscribeExternalSourcesLoad
} from "../externalSources/externalSourcesLoadManager";
import "../styles/ExternalSourcesLoadStatusBar.css";

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(value);
}

function SourceLoadRow({
  label,
  state,
  onCancel,
  onOpen
}) {
  const { loading, fetched, total, seriesLabel, seriesIndex, seriesTotal } = state;
  if (!loading) {
    return null;
  }

  const hasTotal = typeof total === "number" && total > 0;
  const ratio = hasTotal ? Math.min(1, fetched / total) : null;
  const progressText = hasTotal
    ? `${formatCount(fetched)} из ${formatCount(total)}`
    : `${formatCount(fetched)} получено`;

  const seriesText =
    seriesIndex != null
      ? seriesTotal != null
        ? `Серия ${seriesIndex} из ${formatCount(seriesTotal)}${
            seriesLabel ? ` · ${seriesLabel}` : ""
          }`
        : `Серия ${seriesIndex}${seriesLabel ? ` · ${seriesLabel}` : ""}`
      : seriesLabel || null;

  return (
    <div className="external-load-status-row">
      <button
        type="button"
        className="external-load-status-main"
        onClick={onOpen}
        title="Открыть панель «Источники данных»"
      >
        <span className="external-load-status-source">{label}</span>
        <span className="external-load-status-detail">
          {seriesText ? <span className="external-load-status-series">{seriesText}</span> : null}
          <span className="external-load-status-counts">{progressText}</span>
        </span>
        <span
          className={`external-load-status-track${
            ratio == null ? " external-load-status-track--indeterminate" : ""
          }`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={hasTotal ? total : undefined}
          aria-valuenow={hasTotal ? fetched : undefined}
          aria-label={`${label}: ${progressText}`}
        >
          <span
            className="external-load-status-bar"
            style={ratio == null ? undefined : { width: `${Math.max(4, ratio * 100)}%` }}
          />
        </span>
      </button>
      <button
        type="button"
        className="external-load-status-cancel"
        onClick={onCancel}
        title={`Отменить загрузку ${label}`}
      >
        Отменить
      </button>
    </div>
  );
}

/**
 * Глобальный статус загрузки GBIF/iNat — виден и при свёрнутой панели.
 */
export default function ExternalSourcesLoadStatusBar({
  bottomOccupyPx = 0,
  onOpenPanel
} = {}) {
  const [snapshot, setSnapshot] = useState(getExternalSourcesLoadSnapshot);

  useEffect(() => subscribeExternalSourcesLoad(setSnapshot), []);

  const gbifLoading = Boolean(snapshot.gbif.loading);
  const inatLoading = Boolean(snapshot.inat.loading);

  if (!gbifLoading && !inatLoading) {
    return null;
  }

  return (
    <div
      className="external-load-status"
      style={bottomOccupyPx > 0 ? { bottom: `${48 + bottomOccupyPx}px` } : undefined}
      role="status"
      aria-live="polite"
      aria-label="Загрузка внешних источников"
    >
      <div className="external-load-status-card">
        <SourceLoadRow
          label="GBIF"
          state={snapshot.gbif}
          onOpen={onOpenPanel}
          onCancel={cancelGbifExternalLoad}
        />
        <SourceLoadRow
          label="iNaturalist"
          state={snapshot.inat}
          onOpen={onOpenPanel}
          onCancel={cancelInatExternalLoad}
        />
      </div>
    </div>
  );
}
