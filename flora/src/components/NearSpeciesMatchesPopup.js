import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  findNearSpeciesMatches,
  formatDistanceMeters,
  formatMatchCoordinates
} from "../dataWork/findNearSpeciesMatches";
import {
  getMatchSourceLabel,
  MATCH_SOURCE_IDS
} from "../dataWork/matchSources";
import {
  getVisibleGbifFeatures,
  getVisibleInatFeatures
} from "./addLocationsLayer";
import "../styles/NearSpeciesMatchesPopup.css";

function ShowPairIcon() {
  return (
    <svg
      className="near-species-matches-show-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2" />
      <line
        x1="8"
        y1="10.5"
        x2="13"
        y2="10.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="10.5"
        y1="8"
        x2="10.5"
        y2="13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="15.5"
        y1="15.5"
        x2="20"
        y2="20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const THRESHOLD_MIN = 0;
const THRESHOLD_MAX = 500;
const THRESHOLD_DEFAULT = 100;

const SORT_COLUMNS = [
  { key: "leftSource", label: "Источник" },
  { key: "leftName", label: "Название вида" },
  { key: "leftCoords", label: "Координаты" },
  { key: "rightSource", label: "Источник" },
  { key: "rightName", label: "Название вида" },
  { key: "rightCoords", label: "Координаты" },
  { key: "distance", label: "Расстояние, м" }
];


function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "ru", {
    sensitivity: "base",
    numeric: true
  });
}

function compareCoordinates(leftCoords, rightCoords) {
  const leftLat = leftCoords?.[1];
  const leftLng = leftCoords?.[0];
  const rightLat = rightCoords?.[1];
  const rightLng = rightCoords?.[0];

  if (leftLat !== rightLat) {
    return (leftLat ?? 0) - (rightLat ?? 0);
  }

  return (leftLng ?? 0) - (rightLng ?? 0);
}

function getSortValue(match, columnKey) {
  switch (columnKey) {
    case "leftSource":
      return getMatchSourceLabel(match.left.source);
    case "leftName":
      return match.left.nameLatin;
    case "leftCoords":
      return match.left.coordinates;
    case "rightSource":
      return getMatchSourceLabel(match.right.source);
    case "rightName":
      return match.right.nameLatin;
    case "rightCoords":
      return match.right.coordinates;
    case "distance":
      return match.distanceMeters;
    default:
      return null;
  }
}

function compareMatches(left, right, columnKey) {
  if (columnKey === "distance") {
    return (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0);
  }

  if (columnKey === "leftCoords" || columnKey === "rightCoords") {
    return compareCoordinates(getSortValue(left, columnKey), getSortValue(right, columnKey));
  }

  return compareText(getSortValue(left, columnKey), getSortValue(right, columnKey));
}

function clampThreshold(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return THRESHOLD_DEFAULT;
  }
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(numeric)));
}

function runNearSpeciesSearch(thresholdMeters) {
  const threshold = clampThreshold(thresholdMeters);
  const gbifFeatures = getVisibleGbifFeatures();
  const inatFeatures = getVisibleInatFeatures();

  if (gbifFeatures.length === 0 || inatFeatures.length === 0) {
    return {
      threshold,
      matches: [],
      statusMessage:
        "Загрузите слои GBIF и iNaturalist (оба нужны для поиска совпадений)."
    };
  }

  const matches = findNearSpeciesMatches({
    leftFeatures: gbifFeatures,
    rightFeatures: inatFeatures,
    thresholdMeters: threshold,
    leftSourceId: MATCH_SOURCE_IDS.GBIF,
    rightSourceId: MATCH_SOURCE_IDS.INATURALIST
  });

  return {
    threshold,
    matches,
    statusMessage:
      matches.length === 0
        ? `Совпадений не найдено в радиусе ${threshold} м.`
        : null
  };
}

/**
 * Диалог «Близкие точки»: таблица пар GBIF ↔ iNaturalist
 * с одинаковым латинским названием в заданном радиусе.
 */
export default function NearSpeciesMatchesPopup({
  open,
  onClose,
  onShowPair,
  onPreviewEnd
}) {
  const [thresholdMeters, setThresholdMeters] = useState(THRESHOLD_DEFAULT);
  const [matches, setMatches] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [searched, setSearched] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [mapPreviewHidden, setMapPreviewHidden] = useState(false);

  const applySearch = useCallback((thresholdValue) => {
    const result = runNearSpeciesSearch(thresholdValue);
    setThresholdMeters(result.threshold);
    setMatches(result.matches);
    setStatusMessage(result.statusMessage);
    setSearched(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setThresholdMeters(THRESHOLD_DEFAULT);
    setMatches([]);
    setStatusMessage(null);
    setSearched(false);
    setSortKey(null);
    setSortDirection("asc");
    setMapPreviewHidden(false);
  }, [open]);

  const handleClose = useCallback(() => {
    if (mapPreviewHidden) {
      onPreviewEnd?.();
    }
    onClose?.();
  }, [mapPreviewHidden, onClose, onPreviewEnd]);

  const handleThresholdInput = (event) => {
    setThresholdMeters(clampThreshold(event.target.value));
  };

  const handleFind = () => {
    applySearch(thresholdMeters);
  };

  const handleSort = useCallback((columnKey) => {
    setSortKey((currentKey) => {
      if (currentKey === columnKey) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }

      setSortDirection("asc");
      return columnKey;
    });
  }, []);

  const handleShowPair = useCallback(
    (match) => {
      setMapPreviewHidden(true);
      onShowPair?.(match);
    },
    [onShowPair]
  );

  const handleReturnToTable = useCallback(() => {
    setMapPreviewHidden(false);
    onPreviewEnd?.();
  }, [onPreviewEnd]);

  const sortedMatches = useMemo(() => {
    if (!sortKey) {
      return matches;
    }

    const directionFactor = sortDirection === "desc" ? -1 : 1;
    return [...matches].sort(
      (left, right) => compareMatches(left, right, sortKey) * directionFactor
    );
  }, [matches, sortDirection, sortKey]);

  if (!open) {
    return null;
  }

  if (mapPreviewHidden) {
    return (
      <div className="near-species-matches-preview-bar">
        <p className="near-species-matches-preview-text">Просмотр пары на карте</p>
        <button
          type="button"
          className="near-species-matches-preview-return"
          onClick={handleReturnToTable}
        >
          К таблице
        </button>
      </div>
    );
  }

  const matchCount = matches.length;

  return (
    <div className="near-species-matches-overlay" onClick={handleClose}>
      <div
        className="near-species-matches-dialog"
        role="dialog"
        aria-label="Близкие точки"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="near-species-matches-close"
          onClick={handleClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className="near-species-matches-title">Близкие точки</h3>
        <p className="near-species-matches-hint">
          Пары точек GBIF и iNaturalist с одинаковым латинским названием вида
          в заданном радиусе.
        </p>

        <div className="near-species-matches-toolbar">
          <label
            className="near-species-matches-threshold-label"
            htmlFor="near-species-matches-threshold"
          >
            Порог, м
          </label>
          <input
            id="near-species-matches-threshold-range"
            className="near-species-matches-threshold-range"
            type="range"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            step={1}
            value={thresholdMeters}
            onChange={handleThresholdInput}
            aria-label="Порог близости в метрах"
          />
          <input
            id="near-species-matches-threshold"
            className="near-species-matches-threshold-number"
            type="number"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            step={1}
            value={thresholdMeters}
            onChange={handleThresholdInput}
          />
          <button
            type="button"
            className="near-species-matches-find-button"
            onClick={handleFind}
          >
            Найти
          </button>
          {searched ? (
            <span className="near-species-matches-count" aria-live="polite">
              Найдено: {matchCount}
            </span>
          ) : null}
        </div>

        {statusMessage ? (
          <p className="near-species-matches-status" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="near-species-matches-table-wrap">
          <table className="near-species-matches-table">
            <thead>
              <tr>
                {SORT_COLUMNS.map((column) => {
                  const isActive = sortKey === column.key;
                  const ariaSort = isActive
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none";
                  const indicator = isActive
                    ? sortDirection === "asc"
                      ? " ▲"
                      : " ▼"
                    : "";

                  return (
                    <th key={column.key} scope="col" aria-sort={ariaSort}>
                      <button
                        type="button"
                        className={`near-species-matches-sort-button${
                          isActive ? " near-species-matches-sort-button--active" : ""
                        }`}
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label}
                        <span className="near-species-matches-sort-indicator" aria-hidden="true">
                          {indicator}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="near-species-matches-actions-col">
                  <span className="near-species-matches-actions-heading">Действие</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedMatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="near-species-matches-table-empty">
                    {searched ? "Нет строк для отображения." : "—"}
                  </td>
                </tr>
              ) : (
                sortedMatches.map((match, index) => (
                  <tr
                    key={`${match.left.coordinates.join(",")}|${match.right.coordinates.join(",")}|${match.nameLatin}|${index}`}
                  >
                    <td>{getMatchSourceLabel(match.left.source)}</td>
                    <td className="near-species-matches-table-name">
                      {match.left.nameLatin}
                    </td>
                    <td className="near-species-matches-table-coords">
                      {formatMatchCoordinates(match.left.coordinates)}
                    </td>
                    <td>{getMatchSourceLabel(match.right.source)}</td>
                    <td className="near-species-matches-table-name">
                      {match.right.nameLatin}
                    </td>
                    <td className="near-species-matches-table-coords">
                      {formatMatchCoordinates(match.right.coordinates)}
                    </td>
                    <td className="near-species-matches-table-distance">
                      {formatDistanceMeters(match.distanceMeters)}
                    </td>
                    <td className="near-species-matches-row-action">
                      <button
                        type="button"
                        className="near-species-matches-show-button"
                        onClick={() => handleShowPair(match)}
                        title="Показать"
                        aria-label="Показать"
                      >
                        <ShowPairIcon />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
