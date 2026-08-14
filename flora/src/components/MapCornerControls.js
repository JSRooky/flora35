import React, { useCallback, useEffect, useRef, useState } from "react";
import { ReactComponent as FilterIcon } from "../images/filter_icon.svg";
import ExternalLayersPicker from "./ExternalLayersPicker";
import RegnumFilterPicker from "./RegnumFilterPicker";
import FeedbackWidget from "./FeedbackWidget";
import "../styles/MapCornerControls.css";

function TrashIcon() {
  return (
    <svg
      className="map-corner-filters-popover-trash-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points="3 6 5 6 21 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="11"
        x2="10"
        y2="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="14"
        y1="11"
        x2="14"
        y2="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Плавающая панель в углу карты: сброс фильтров и виджет обратной связи. */
export default function MapCornerControls({
  activeFilters = [],
  onFiltersReset,
  onFilterClear,
  externalLayersVisible = false,
  externalLayersEnabled,
  externalLayersDataRevision = 0,
  onExternalLayerToggle,
  onExternalLayerRequestLoad,
  regnumFilters = [],
  onRegnumFilterChange
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wrapRef = useRef(null);

  const filterCount = activeFilters.length;
  const filtersActive = filterCount > 0;
  const multiFilters = filterCount > 1;

  // Список остаётся, пока есть хотя бы один фильтр; закрываем только когда все сняты.
  useEffect(() => {
    if (!filtersActive) {
      setPopoverOpen(false);
    }
  }, [filtersActive]);

  const handleDocumentClick = useCallback(
    (event) => {
      if (!popoverOpen) {
        return;
      }

      if (!wrapRef.current?.contains(event.target)) {
        setPopoverOpen(false);
      }
    },
    [popoverOpen]
  );

  useEffect(() => {
    if (!popoverOpen) {
      return undefined;
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick, popoverOpen]);

  useEffect(() => {
    if (!popoverOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPopoverOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [popoverOpen]);

  const filterTitle = !filtersActive
    ? "Нет активных фильтров"
    : popoverOpen
      ? "Скрыть список фильтров"
      : multiFilters
        ? "Активные фильтры"
        : "Сбросить фильтр";

  const handleFilterButtonClick = () => {
    if (!filtersActive) {
      return;
    }

    if (popoverOpen) {
      setPopoverOpen(false);
      return;
    }

    if (multiFilters) {
      setPopoverOpen(true);
      return;
    }

    onFiltersReset?.();
  };

  const handleClearOne = (filterId) => {
    onFilterClear?.(filterId);
  };

  const handleClearAll = () => {
    onFiltersReset?.();
  };

  return (
    <div className="map-corner-controls" aria-label="Элементы управления картой">
      <div className="map-corner-controls-bar" ref={wrapRef}>
        <button
          type="button"
          className={`map-corner-controls-btn map-corner-controls-btn--filter${
            filtersActive ? " map-corner-controls-btn--active" : ""
          }${!filtersActive ? " map-corner-controls-btn--disabled" : ""}`}
          onClick={handleFilterButtonClick}
          disabled={!filtersActive}
          aria-pressed={filtersActive}
          aria-haspopup={multiFilters || popoverOpen ? "dialog" : undefined}
          aria-expanded={popoverOpen}
          aria-label={filterTitle}
          title={filterTitle}
        >
          <FilterIcon className="map-corner-controls-btn-icon" aria-hidden="true" focusable="false" />
        </button>

        {popoverOpen && filtersActive ? (
          <div
            className="map-corner-filters-popover"
            role="dialog"
            aria-label="Активные фильтры"
          >
            <p className="map-corner-filters-popover-title">Активные фильтры</p>
            <ul className="map-corner-filters-popover-list">
              {activeFilters.map(({ id, label }) => (
                <li key={id} className="map-corner-filters-popover-row">
                  <span className="map-corner-filters-popover-item-label">{label}</span>
                  <button
                    type="button"
                    className="map-corner-filters-popover-trash"
                    onClick={() => handleClearOne(id)}
                    aria-label={`Сбросить: ${label}`}
                    title={`Сбросить: ${label}`}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="map-corner-filters-popover-reset-all"
              onClick={handleClearAll}
            >
              Сбросить все
            </button>
          </div>
        ) : null}
      </div>
      <div className="map-corner-controls-footer">
        <FeedbackWidget />
        <RegnumFilterPicker
          activeRegnumFilters={regnumFilters}
          onRegnumFilterChange={onRegnumFilterChange}
        />
        <ExternalLayersPicker
          visible={externalLayersVisible}
          enabledLayers={externalLayersEnabled}
          dataRevision={externalLayersDataRevision}
          onToggleLayer={onExternalLayerToggle}
          onRequestLoad={onExternalLayerRequestLoad}
        />
      </div>
    </div>
  );
}
