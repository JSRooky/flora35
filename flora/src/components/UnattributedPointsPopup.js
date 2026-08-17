import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  findUnattributedPointsAsync,
  formatMissingFields,
  formatPointCoordinates,
  getMissingAttributionFields,
  getPointSourceLabel,
  isEmptyAttr
} from "../dataWork/findUnattributedPoints";
import { getStablePointKey, getToolFeatures, setToolFeaturesContext } from "./addLocationsLayer";
import UnattributedAttributionEditor from "./UnattributedAttributionEditor";
import PanelHint from "./PanelHint";
import "../styles/UnattributedPointsPopup.css";
import { EyeIcon, EyeOffIcon, ZoomInIcon } from "../images/buttons";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const PAGE_SIZE_DEFAULT = 100;

const SORT_COLUMNS = [
  { key: "source", label: "Источник" },
  { key: "displayName", label: "Название" },
  { key: "coordinates", label: "Координаты" },
  { key: "missingFields", label: "Нет атрибутов" }
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

function getSortValue(row, columnKey) {
  switch (columnKey) {
    case "source":
      return getPointSourceLabel(row.source);
    case "displayName":
      return row.displayName;
    case "coordinates":
      return row.coordinates;
    case "missingFields":
      return formatMissingFields(row.missingFields);
    default:
      return null;
  }
}

function compareRows(left, right, columnKey) {
  if (columnKey === "coordinates") {
    return compareCoordinates(getSortValue(left, columnKey), getSortValue(right, columnKey));
  }

  return compareText(getSortValue(left, columnKey), getSortValue(right, columnKey));
}

/**
 * Диалог «Без атрибуции»: точки без царства, семейства, латыни или года.
 */
export default function UnattributedPointsPopup({
  open,
  onClose,
  onShowPoint,
  onPreviewEnd,
  onToggleHiddenPoint,
  onAttributionSaved,
  hiddenPointKeys = [],
  locationFilters = null
}) {
  const [rows, setRows] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [mapPreviewHidden, setMapPreviewHidden] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const searchGenerationRef = useRef(0);

  const cancelActiveSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    setSearching(false);
  }, []);

  const applySearch = useCallback(async () => {
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;
    const signal = {
      get aborted() {
        return searchGenerationRef.current !== generation;
      }
    };

    setSearching(true);
    setStatusMessage("Ищем…");
    setSearched(true);
    setPage(1);

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal.aborted) {
      return;
    }

    setToolFeaturesContext({
      includeLocal: true,
      includeGbif: true,
      includeInat: true,
      includeMerged: true
    });
    const features = getToolFeatures(locationFilters ?? {});

    if (features.length === 0) {
      if (signal.aborted) {
        return;
      }
      setRows([]);
      setStatusMessage(
        "Нет видимых точек. Загрузите слои или снимите фильтры, скрывающие данные."
      );
      setSearching(false);
      return;
    }

    const nextRows = await findUnattributedPointsAsync(features, { signal });

    if (signal.aborted) {
      return;
    }

    setRows(nextRows);
    setStatusMessage(
      nextRows.length === 0
        ? "Точек без атрибуции не найдено."
        : null
    );
    setSearching(false);
  }, [locationFilters]);

  useEffect(() => {
    if (!open) {
      cancelActiveSearch();
      return;
    }

    setRows([]);
    setStatusMessage(null);
    setSearched(false);
    setSearching(false);
    setSortKey(null);
    setSortDirection("asc");
    setPage(1);
    setPageSize(PAGE_SIZE_DEFAULT);
    setMapPreviewHidden(false);
    setEditingRow(null);
  }, [open, cancelActiveSearch]);

  const handleClose = useCallback(() => {
    cancelActiveSearch();
    if (mapPreviewHidden) {
      onPreviewEnd?.();
    }
    onClose?.();
  }, [cancelActiveSearch, mapPreviewHidden, onClose, onPreviewEnd]);

  const handleFind = () => {
    if (searching) {
      return;
    }
    applySearch();
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

  const hiddenPointKeySet = useMemo(
    () => new Set(hiddenPointKeys.map(String)),
    [hiddenPointKeys]
  );

  const handleShowPoint = useCallback(
    (row) => {
      setMapPreviewHidden(true);
      onShowPoint?.(row);
    },
    [onShowPoint]
  );

  const handleToggleHidden = useCallback(
    (row) => {
      onToggleHiddenPoint?.(row);
    },
    [onToggleHiddenPoint]
  );

  const handleReturnToTable = useCallback(() => {
    setMapPreviewHidden(false);
    onPreviewEnd?.();
  }, [onPreviewEnd]);

  const handleOpenEditor = useCallback((row) => {
    setEditingRow(row);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingRow(null);
  }, []);

  const handleAttributionSaved = useCallback(
    ({ pointKey, attributes }) => {
      setRows((current) => {
        const next = [];

        current.forEach((row) => {
          const key = getStablePointKey(row.feature);
          if (key !== pointKey) {
            next.push(row);
            return;
          }

          const enrichedFeature = {
            ...row.feature,
            properties: {
              ...(row.feature?.properties ?? {}),
              ...attributes
            }
          };
          const missingFields = getMissingAttributionFields(enrichedFeature);
          if (missingFields.length === 0) {
            return;
          }

          const displayName =
            (!isEmptyAttr(enrichedFeature.properties?.name_latin) &&
              String(enrichedFeature.properties.name_latin).trim()) ||
            (!isEmptyAttr(enrichedFeature.properties?.name_ru) &&
              String(enrichedFeature.properties.name_ru).trim()) ||
            row.displayName;

          next.push({
            ...row,
            feature: enrichedFeature,
            missingFields,
            displayName
          });
        });

        return next;
      });

      setStatusMessage("Атрибуция сохранена.");
      onAttributionSaved?.({ pointKey, attributes });
    },
    [onAttributionSaved]
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) {
      return rows;
    }

    const directionFactor = sortDirection === "desc" ? -1 : 1;
    return [...rows].sort(
      (left, right) => compareRows(left, right, sortKey) * directionFactor
    );
  }, [rows, sortDirection, sortKey]);

  const rowCount = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / pageSize) || 1);
  const currentPage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedRows]);

  const pageStartIndex = rowCount === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageRows.length, rowCount);

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
      <div className="unattributed-points-preview-bar">
        <p className="unattributed-points-preview-text">Просмотр точки на карте</p>
        <button
          type="button"
          className="unattributed-points-preview-return"
          onClick={handleReturnToTable}
        >
          К таблице
        </button>
      </div>
    );
  }

  const canPaginate = rowCount > 0;

  return (
    <>
    <div className="unattributed-points-overlay" onClick={handleClose}>
      <div
        className="unattributed-points-dialog"
        role="dialog"
        aria-label="Без атрибуции"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="unattributed-points-close"
          onClick={handleClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h3 className="unattributed-points-title">Без атрибуции</h3>
        <PanelHint>
          Точки всех видимых слоёв, у которых нет царства, семейства, латинского
          названия или года находки. Клик по строке — заполнить пустые поля и
          сохранить в Firebase.
        </PanelHint>

        <div className="unattributed-points-toolbar">
          <button
            type="button"
            className="unattributed-points-find-button"
            onClick={handleFind}
            disabled={searching}
          >
            {searching ? "Ищем…" : "Найти"}
          </button>
          {searched && !searching ? (
            <span className="unattributed-points-count" aria-live="polite">
              Найдено: {rowCount}
            </span>
          ) : null}
        </div>

        {statusMessage ? (
          <p className="unattributed-points-status" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="unattributed-points-table-wrap">
          <table className="unattributed-points-table">
            <thead>
              <tr>
                <th scope="col" className="unattributed-points-rownum-col">
                  <span className="unattributed-points-rownum-heading">№</span>
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
                        className={`unattributed-points-sort-button${
                          isActive ? " unattributed-points-sort-button--active" : ""
                        }`}
                        onClick={() => handleSort(column.key)}
                        disabled={searching}
                      >
                        {column.label}
                        <span className="unattributed-points-sort-indicator" aria-hidden="true">
                          {indicator}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="unattributed-points-actions-col">
                  <span className="unattributed-points-actions-heading">Действие</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="unattributed-points-table-empty">
                    {searching
                      ? "Ищем точки…"
                      : searched
                        ? "Нет строк для отображения."
                        : "—"}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, index) => {
                  const rowNumber = pageStartIndex + index + 1;
                  const coordKey = row.coordinates.join(",");
                  const pointKey = getStablePointKey(row.feature);
                  const isHidden = hiddenPointKeySet.has(pointKey);
                  return (
                    <tr
                      key={`${row.source}|${coordKey}|${row.displayName}|${rowNumber}`}
                      className={`unattributed-points-row--clickable${
                        isHidden ? " unattributed-points-row--hidden" : ""
                      }`}
                      onClick={() => handleOpenEditor(row)}
                      title="Заполнить атрибуцию"
                    >
                      <td className="unattributed-points-table-rownum">{rowNumber}</td>
                      <td>{getPointSourceLabel(row.source)}</td>
                      <td className="unattributed-points-table-name">{row.displayName}</td>
                      <td className="unattributed-points-table-coords">
                        {formatPointCoordinates(row.coordinates)}
                      </td>
                      <td className="unattributed-points-table-missing">
                        {formatMissingFields(row.missingFields)}
                      </td>
                      <td
                        className="unattributed-points-row-action"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={`unattributed-points-hide-button${
                            isHidden ? " unattributed-points-hide-button--active" : ""
                          }`}
                          onClick={() => handleToggleHidden(row)}
                          title={isHidden ? "Показать на карте" : "Скрыть с карты"}
                          aria-label={isHidden ? "Показать на карте" : "Скрыть с карты"}
                          aria-pressed={isHidden}
                        >
                          {isHidden ? <EyeOffIcon className="unattributed-points-eye-icon" aria-hidden="true" focusable="false" /> : <EyeIcon className="unattributed-points-eye-icon" aria-hidden="true" focusable="false" />}
                        </button>
                        <button
                          type="button"
                          className="unattributed-points-show-button"
                          onClick={() => handleShowPoint(row)}
                          title="Показать"
                          aria-label="Показать"
                          disabled={isHidden}
                        >
                          <ZoomInIcon className="unattributed-points-show-icon" aria-hidden="true" focusable="false" />
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
          <div className="unattributed-points-pagination" aria-label="Страницы таблицы">
            <label
              className="unattributed-points-page-size-label"
              htmlFor="unattributed-points-page-size"
            >
              На странице
            </label>
            <select
              id="unattributed-points-page-size"
              className="unattributed-points-page-size"
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

            <span className="unattributed-points-page-range" aria-live="polite">
              {pageStartIndex + 1}–{pageEndIndex} из {rowCount}
            </span>

            <div className="unattributed-points-page-nav">
              <button
                type="button"
                className="unattributed-points-page-button"
                onClick={() => setPage(currentPage - 1)}
                disabled={searching || currentPage <= 1}
                aria-label="Предыдущая страница"
              >
                ‹
              </button>
              <span className="unattributed-points-page-indicator">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="unattributed-points-page-button"
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
    {editingRow ? (
      <UnattributedAttributionEditor
        row={editingRow}
        onClose={handleCloseEditor}
        onSaved={handleAttributionSaved}
      />
    ) : null}
    </>
  );
}
