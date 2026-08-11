import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  findNearSpeciesMatchesAsync,
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

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const PAGE_SIZE_DEFAULT = 100;

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
  const [searching, setSearching] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [mapPreviewHidden, setMapPreviewHidden] = useState(false);
  const searchGenerationRef = useRef(0);

  const cancelActiveSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    setSearching(false);
  }, []);

  const applySearch = useCallback(async (thresholdValue) => {
    const threshold = clampThreshold(thresholdValue);
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;
    const signal = {
      get aborted() {
        return searchGenerationRef.current !== generation;
      }
    };

    setThresholdMeters(threshold);
    setSearching(true);
    setStatusMessage("Ищем…");
    setSearched(true);
    setPage(1);

    // Даём UI отрисовать состояние «Ищем…» до тяжёлой работы.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal.aborted) {
      return;
    }

    const gbifFeatures = getVisibleGbifFeatures();
    const inatFeatures = getVisibleInatFeatures();

    if (gbifFeatures.length === 0 || inatFeatures.length === 0) {
      if (signal.aborted) {
        return;
      }
      setMatches([]);
      setStatusMessage(
        "Загрузите слои GBIF и iNaturalist (оба нужны для поиска совпадений)."
      );
      setSearching(false);
      return;
    }

    const nextMatches = await findNearSpeciesMatchesAsync(
      {
        leftFeatures: gbifFeatures,
        rightFeatures: inatFeatures,
        thresholdMeters: threshold,
        leftSourceId: MATCH_SOURCE_IDS.GBIF,
        rightSourceId: MATCH_SOURCE_IDS.INATURALIST
      },
      { signal }
    );

    if (signal.aborted) {
      return;
    }

    setMatches(nextMatches);
    setStatusMessage(
      nextMatches.length === 0
        ? `Совпадений не найдено в радиусе ${threshold} м.`
        : null
    );
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!open) {
      cancelActiveSearch();
      return;
    }

    setThresholdMeters(THRESHOLD_DEFAULT);
    setMatches([]);
    setStatusMessage(null);
    setSearched(false);
    setSearching(false);
    setSortKey(null);
    setSortDirection("asc");
    setPage(1);
    setPageSize(PAGE_SIZE_DEFAULT);
    setMapPreviewHidden(false);
  }, [open, cancelActiveSearch]);

  const handleClose = useCallback(() => {
    cancelActiveSearch();
    if (mapPreviewHidden) {
      onPreviewEnd?.();
    }
    onClose?.();
  }, [cancelActiveSearch, mapPreviewHidden, onClose, onPreviewEnd]);

  const handleThresholdInput = (event) => {
    setThresholdMeters(clampThreshold(event.target.value));
  };

  const handleFind = () => {
    if (searching) {
      return;
    }
    applySearch(thresholdMeters);
  };

  const handleSort = useCallback((columnKey) => {
    setPage(1);
    setSortKey((currentKey) => {
      if (currentKey === columnKey) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }

      setSortDirection("asc");
      return columnKey;
    });
  }, []);

  const handlePageSizeChange = useCallback((event) => {
    const nextSize = Number(event.target.value);
    setPageSize(
      PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : PAGE_SIZE_DEFAULT
    );
    setPage(1);
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

  const matchCount = sortedMatches.length;
  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize) || 1);
  const currentPage = Math.min(page, totalPages);

  const pageMatches = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedMatches.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedMatches]);

  const pageStartIndex = matchCount === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageMatches.length, matchCount);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

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

  const canPaginate = matchCount > 0;

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
            disabled={searching}
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
            disabled={searching}
          />
          <button
            type="button"
            className="near-species-matches-find-button"
            onClick={handleFind}
            disabled={searching}
          >
            {searching ? "Ищем…" : "Найти"}
          </button>
          {searched && !searching ? (
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
                <th scope="col" className="near-species-matches-rownum-col">
                  <span className="near-species-matches-rownum-heading">№</span>
                </th>
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
                        disabled={searching}
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
              {pageMatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="near-species-matches-table-empty">
                    {searching
                      ? "Ищем совпадения…"
                      : searched
                        ? "Нет строк для отображения."
                        : "—"}
                  </td>
                </tr>
              ) : (
                pageMatches.map((match, index) => {
                  const rowNumber = pageStartIndex + index + 1;
                  return (
                    <tr
                      key={`${match.left.coordinates.join(",")}|${match.right.coordinates.join(",")}|${match.nameLatin}|${rowNumber}`}
                    >
                      <td className="near-species-matches-table-rownum">{rowNumber}</td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {canPaginate ? (
          <div className="near-species-matches-pagination" aria-label="Страницы таблицы">
            <label
              className="near-species-matches-page-size-label"
              htmlFor="near-species-matches-page-size"
            >
              На странице
            </label>
            <select
              id="near-species-matches-page-size"
              className="near-species-matches-page-size"
              value={pageSize}
              onChange={handlePageSizeChange}
              disabled={searching}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            <span className="near-species-matches-page-range" aria-live="polite">
              {pageStartIndex + 1}–{pageEndIndex} из {matchCount}
            </span>

            <div className="near-species-matches-page-nav">
              <button
                type="button"
                className="near-species-matches-page-button"
                onClick={() => setPage(currentPage - 1)}
                disabled={searching || currentPage <= 1}
                aria-label="Предыдущая страница"
              >
                ‹
              </button>
              <span className="near-species-matches-page-indicator">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="near-species-matches-page-button"
                onClick={() => setPage(currentPage + 1)}
                disabled={searching || currentPage >= totalPages}
                aria-label="Следующая страница"
              >
                ›
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
