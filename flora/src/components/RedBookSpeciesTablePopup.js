import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import {
  collectLatinNormsFromMatches,
  filterMatchFeaturesByLatinNorm,
  matchRedBookOccurrences
} from "../redbook/matchRedBookOccurrences";
import {
  getRedBookList,
  getRedBookLastSearchCollection,
  getRedBookMatches,
  setRedBookLastSearchResult
} from "../redbook/redBookStore";
import { getGbifFeatureCount } from "../gbif/gbifStore";
import { getInatFeatureCount } from "../inaturalist/inatStore";
import { getAllTempLayerFeatureCount } from "../tempLayers/tempLayerStore";
import "../styles/RedBookSpeciesTablePopup.css";

const SORT_COLUMNS = [
  { key: "name_latin", label: "Латынь" },
  { key: "status", label: "Статус" },
  { key: "gbifCount", label: "GBIF" },
  { key: "inatCount", label: "iNat" },
  { key: "pointCount", label: "Всего" }
];

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""), "en", {
    sensitivity: "base"
  });
}

/**
 * Диалог-таблица видов списка Красной книги (как NearSpeciesMatches).
 * «Поиск» — счётчики; «Добавить в слой» — точки вида на слой совпадений.
 */
export default function RedBookSpeciesTablePopup({
  open,
  species = [],
  initialCounts = null,
  layerPointCount = 0,
  onClose,
  onSearchComplete,
  onAddSpeciesToLayer
}) {
  const [sortKey, setSortKey] = useState("name_latin");
  const [sortDirection, setSortDirection] = useState("asc");
  const [searching, setSearching] = useState(false);
  const [addingNorm, setAddingNorm] = useState(null);
  const [searched, setSearched] = useState(Boolean(initialCounts?.length));
  const [statusMessage, setStatusMessage] = useState(null);
  const [matchCollection, setMatchCollection] = useState(
    () => getRedBookLastSearchCollection()
  );
  const [countsByNorm, setCountsByNorm] = useState(() => {
    const map = new Map();
    for (const row of initialCounts ?? []) {
      if (row?.name_latin_norm) {
        map.set(row.name_latin_norm, row);
      }
    }
    return map;
  });
  const [addedNorms, setAddedNorms] = useState(
    () => collectLatinNormsFromMatches(getRedBookMatches())
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const map = new Map();
    for (const row of initialCounts ?? []) {
      if (row?.name_latin_norm) {
        map.set(row.name_latin_norm, row);
      }
    }
    setCountsByNorm(map);
    setSearched(Boolean(initialCounts?.length));
    setMatchCollection(getRedBookLastSearchCollection());
    setAddedNorms(collectLatinNormsFromMatches(getRedBookMatches()));
  }, [open, initialCounts, layerPointCount]);

  const rows = useMemo(() => {
    return (species ?? []).map((item, index) => {
      const counts = countsByNorm.get(item.name_latin_norm) ?? null;
      return {
        index,
        name_latin: item.name_latin,
        name_latin_norm: item.name_latin_norm,
        status: item.status,
        gbifCount: counts ? counts.gbifCount : null,
        inatCount: counts ? counts.inatCount : null,
        pointCount: counts ? counts.pointCount : null
      };
    });
  }, [species, countsByNorm]);

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      const result = compareValues(a[sortKey], b[sortKey]);
      return sortDirection === "asc" ? result : -result;
    });
    return next;
  }, [rows, sortKey, sortDirection]);

  const handleSort = useCallback((key) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDirection(key === "name_latin" || key === "status" ? "asc" : "desc");
      return key;
    });
  }, []);

  const handleSearch = useCallback(() => {
    setSearching(true);
    setStatusMessage(null);

    window.setTimeout(() => {
      try {
        const list = getRedBookList();
        const { collection, stats } = matchRedBookOccurrences(list);
        // Поиск только заполняет счётчики; слой пополняется кнопкой «Добавить в слой».
        setRedBookLastSearchResult(collection, stats);
        setMatchCollection(collection);

        const map = new Map();
        for (const row of stats.speciesCounts ?? []) {
          map.set(row.name_latin_norm, row);
        }
        setCountsByNorm(map);
        setSearched(true);
        setAddedNorms(collectLatinNormsFromMatches(getRedBookMatches()));
        onSearchComplete?.(stats);
        setStatusMessage(
          stats.pointCount > 0
            ? `Найдено ${stats.pointCount} точек у ${stats.matchedSpeciesCount} видов`
            : "Совпадений в загруженных GBIF/iNat и временных слоях нет"
        );
      } catch (error) {
        setStatusMessage(`Ошибка поиска: ${error?.message || "error"}`);
      } finally {
        setSearching(false);
      }
    }, 0);
  }, [onSearchComplete]);

  const handleAddSpecies = useCallback(
    (row) => {
      if (!row?.name_latin_norm || !row.pointCount) {
        return;
      }

      const sourceCollection = matchCollection;
      if (!sourceCollection) {
        setStatusMessage("Сначала нажмите «Поиск»");
        return;
      }

      const features = filterMatchFeaturesByLatinNorm(
        sourceCollection,
        row.name_latin_norm
      );
      if (features.length === 0) {
        setStatusMessage(`Нет точек для ${row.name_latin}`);
        return;
      }

      setAddingNorm(row.name_latin_norm);
      try {
        const result = onAddSpeciesToLayer?.(features, row);
        setAddedNorms((prev) => {
          const next = new Set(prev);
          next.add(row.name_latin_norm);
          return next;
        });
        const added = result?.added ?? features.length;
        setStatusMessage(
          `«${row.name_latin}»: в слой ${added > 0 ? `добавлено ${added}` : "уже было"} (${features.length} точ.)`
        );
      } catch (error) {
        setStatusMessage(`Не удалось добавить: ${error?.message || "error"}`);
      } finally {
        setAddingNorm(null);
      }
    },
    [matchCollection, onAddSpeciesToLayer]
  );

  if (!open) {
    return null;
  }

  const formatCount = (value) => {
    if (!searched || value == null) {
      return "—";
    }
    return Number(value).toLocaleString("ru-RU");
  };

  return (
    <div
      className="redbook-species-table-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="redbook-species-table-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Таблица видов Красной книги"
      >
        <div className="redbook-species-table-header">
          <h3 className="redbook-species-table-title">Таблица видов</h3>
          <div className="popup-panel-header-actions">
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
          </div>
        </div>

        <PanelHint>
          Виды из загруженного списка. «Поиск» сканирует уже загруженные точки GBIF (
          {getGbifFeatureCount().toLocaleString("ru-RU")}), iNaturalist (
          {getInatFeatureCount().toLocaleString("ru-RU")}) и временных слоёв (
          {getAllTempLayerFeatureCount().toLocaleString("ru-RU")}) и пишет число совпадений в
          строку. «Добавить в слой» переносит точки вида на слой Красной книги.
        </PanelHint>

        <div className="redbook-species-table-toolbar">
          <button
            type="button"
            className="redbook-species-table-search-button"
            onClick={handleSearch}
            disabled={searching || species.length === 0}
          >
            {searching ? "Поиск…" : "Поиск"}
          </button>
          <span className="redbook-species-table-count" aria-live="polite">
            Видов: {species.length.toLocaleString("ru-RU")}
          </span>
        </div>

        {statusMessage ? (
          <p className="redbook-species-table-status" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="redbook-species-table-wrap">
          <table className="redbook-species-table">
            <thead>
              <tr>
                <th scope="col" className="redbook-species-table-rownum-col">
                  <span className="redbook-species-table-rownum-heading">№</span>
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
                        className={`redbook-species-table-sort-button${
                          isActive ? " redbook-species-table-sort-button--active" : ""
                        }`}
                        onClick={() => handleSort(column.key)}
                        disabled={searching}
                      >
                        {column.label}
                        <span
                          className="redbook-species-table-sort-indicator"
                          aria-hidden="true"
                        >
                          {indicator}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="redbook-species-table-actions-col">
                  <span className="redbook-species-table-actions-heading">Действие</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="redbook-species-table-empty">
                    Список видов пуст.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, index) => {
                  const hasMatches = searched && (row.pointCount ?? 0) > 0;
                  const alreadyAdded = addedNorms.has(row.name_latin_norm);
                  const isAdding = addingNorm === row.name_latin_norm;

                  return (
                    <tr key={row.name_latin_norm || `${row.name_latin}-${index}`}>
                      <td className="redbook-species-table-rownum">{index + 1}</td>
                      <td className="redbook-species-table-latin">{row.name_latin}</td>
                      <td className="redbook-species-table-status-cell">{row.status}</td>
                      <td className="redbook-species-table-count-cell">
                        {formatCount(row.gbifCount)}
                      </td>
                      <td className="redbook-species-table-count-cell">
                        {formatCount(row.inatCount)}
                      </td>
                      <td className="redbook-species-table-count-cell redbook-species-table-count-cell--total">
                        {formatCount(row.pointCount)}
                      </td>
                      <td className="redbook-species-table-row-action">
                        {hasMatches ? (
                          <button
                            type="button"
                            className={`redbook-species-table-add-button${
                              alreadyAdded
                                ? " redbook-species-table-add-button--added"
                                : ""
                            }`}
                            onClick={() => handleAddSpecies(row)}
                            disabled={
                              searching || isAdding || !matchCollection || alreadyAdded
                            }
                            title={
                              alreadyAdded
                                ? "Уже в слое Красной книги"
                                : "Добавить точки вида на слой"
                            }
                          >
                            {isAdding
                              ? "…"
                              : alreadyAdded
                                ? "В слое"
                                : "Добавить в слой"}
                          </button>
                        ) : (
                          <span className="redbook-species-table-action-placeholder">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
