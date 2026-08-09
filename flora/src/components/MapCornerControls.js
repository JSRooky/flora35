import React from "react";
import { ReactComponent as FilterIcon } from "../images/filter_icon.svg";
import FeedbackWidget from "./FeedbackWidget";
import "../styles/MapCornerControls.css";

/** Плавающая панель в углу карты: сброс фильтров и виджет обратной связи. */
export default function MapCornerControls({
  filtersActive = false,
  onFiltersReset
}) {
  const filterTitle = filtersActive
    ? "Сбросить фильтры"
    : "Нет активных фильтров";

  return (
    <div className="map-corner-controls" aria-label="Элементы управления картой">
      <div className="map-corner-controls-bar">
        <button
          type="button"
          className={`map-corner-controls-btn map-corner-controls-btn--filter${
            filtersActive ? " map-corner-controls-btn--active" : ""
          }${!filtersActive ? " map-corner-controls-btn--disabled" : ""}`}
          onClick={onFiltersReset}
          disabled={!filtersActive}
          aria-pressed={filtersActive}
          aria-label={filterTitle}
          title={filterTitle}
        >
          <FilterIcon className="map-corner-controls-btn-icon" aria-hidden="true" focusable="false" />
        </button>
      </div>
      <FeedbackWidget />
    </div>
  );
}
