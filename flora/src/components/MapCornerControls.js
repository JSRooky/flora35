import React from "react";
import { ReactComponent as FilterIcon } from "../images/filter_icon.svg";
import FeedbackWidget from "./FeedbackWidget";
import "../styles/MapCornerControls.css";

/** Плавающая панель в углу карты: кнопка фильтра по ООПТ и виджет обратной связи. */
export default function MapCornerControls({
  ooptFilterEnabled = false,
  ooptFilterAvailable = false,
  onOoptFilterToggle,
  ooptFilterTooltip = "Только точки в выбранной ООПТ"
}) {
  const filterTitle = !ooptFilterAvailable
    ? "Выберите ООПТ на карте"
    : ooptFilterEnabled
      ? `${ooptFilterTooltip}. Нажмите, чтобы показать все точки`
      : ooptFilterTooltip;

  return (
    <div className="map-corner-controls" aria-label="Элементы управления картой">
      <div className="map-corner-controls-bar">
        <button
          type="button"
          className={`map-corner-controls-btn map-corner-controls-btn--filter${
            ooptFilterEnabled ? " map-corner-controls-btn--active" : ""
          }${!ooptFilterAvailable ? " map-corner-controls-btn--disabled" : ""}`}
          onClick={onOoptFilterToggle}
          disabled={!ooptFilterAvailable}
          aria-pressed={ooptFilterEnabled}
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
