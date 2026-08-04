import React from "react";
import { ReactComponent as FilterIcon } from "../images/filter_icon.svg";
import "../styles/PointsFilterButton.css";

/** Кнопка «Только эти» — показать или скрыть маркеры внутри выделенной области инструмента. */
export default function PointsFilterButton({
  enabled = false,
  onToggle,
  disabled = false,
  title = "Только эти"
}) {
  return (
    <button
      type="button"
      className={`points-filter-btn${enabled ? " points-filter-btn--active" : ""}${
        disabled ? " points-filter-btn--disabled" : ""
      }`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={enabled}
      aria-label={title}
      title={title}
    >
      <FilterIcon className="points-filter-btn-icon" />
    </button>
  );
}
