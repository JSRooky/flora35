import React, { useEffect, useRef, useState } from "react";
import { getYearBounds } from "./yearBounds";
import "../styles/YearFilterPanel.css";

const YEAR_BOUNDS = getYearBounds();

function getRangeProgress(value, min, max) {
  return ((value - min) / (max - min)) * 100;
}

function getCollapsedSummary(enabled, range, lockedByPropertyFilter) {
  if (lockedByPropertyFilter) {
    return "Отключён: фильтр по точке";
  }

  if (!enabled) {
    return "Фильтр выключен";
  }

  return `${range.min} — ${range.max}`;
}

export default function YearFilterPanel({
  enabled = false,
  onEnabledChange,
  range = YEAR_BOUNDS,
  onRangeChange,
  lockedByPropertyFilter = false,
  collapsed: collapsedProp,
  onCollapsedChange
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const [draftRange, setDraftRange] = useState(range);
  const [activeThumb, setActiveThumb] = useState(null);
  const draftRangeRef = useRef(draftRange);
  const isDraggingRef = useRef(false);
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const { min: minYear, max: maxYear } = YEAR_BOUNDS;

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }

    setDraftRange((prev) =>
      prev.min === range.min && prev.max === range.max ? prev : range
    );
  }, [range.min, range.max]);

  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

  const commitRange = () => {
    const next = draftRangeRef.current;
    onRangeChange?.({ min: next.min, max: next.max });
    setActiveThumb(null);
  };

  const handlePointerDown = (thumb) => (event) => {
    isDraggingRef.current = true;
    setActiveThumb(thumb);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event) => {
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    commitRange();
  };

  const handlePointerCancel = () => {
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    setDraftRange(range);
    draftRangeRef.current = range;
    setActiveThumb(null);
  };

  const handleKeyUp = (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(
        event.key
      )
    ) {
      return;
    }

    commitRange();
  };

  const handleStartChange = (event) => {
    const nextMin = Number(event.target.value);
    setDraftRange((prev) => ({
      min: Math.min(nextMin, prev.max),
      max: prev.max
    }));
  };

  const handleEndChange = (event) => {
    const nextMax = Number(event.target.value);
    setDraftRange((prev) => ({
      min: prev.min,
      max: Math.max(nextMax, prev.min)
    }));
  };

  const sliderInteractionHandlers = {
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onKeyUp: handleKeyUp
  };

  const isFullRange = draftRange.min === minYear && draftRange.max === maxYear;

  const handleResetRange = () => {
    const fullRange = { min: minYear, max: maxYear };
    setDraftRange(fullRange);
    draftRangeRef.current = fullRange;
    onRangeChange?.(fullRange);
  };

  return (
    <aside className={`year-filter-panel ${collapsed ? "year-filter-panel--collapsed" : ""}`}>
      <div className="year-filter-panel-header">
        <h3 className="year-filter-panel-title">Год находки</h3>
        <button
          type="button"
          className="year-filter-panel-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {collapsed ? (
        <p className="year-filter-panel-summary">
          {getCollapsedSummary(enabled, range, lockedByPropertyFilter)}
        </p>
      ) : (
        <div className="year-filter-panel-content">
          <div className="year-filter-controls-row">
            <label
              className={`year-filter-switch${
                lockedByPropertyFilter ? " year-filter-switch--disabled" : ""
              }`}
              title={
                lockedByPropertyFilter
                  ? "Недоступно: включён фильтр по году в сведениях о точке"
                  : "Показывать только точки в выбранном диапазоне лет"
              }
            >
              <input
                type="checkbox"
                checked={enabled}
                disabled={lockedByPropertyFilter}
                onChange={(e) => onEnabledChange?.(e.target.checked)}
              />
              <span className="year-filter-switch-slider" />
              <span className="year-filter-switch-label">Фильтровать по годам</span>
            </label>

            <button
              type="button"
              className="year-filter-reset"
              onClick={handleResetRange}
              disabled={lockedByPropertyFilter || isFullRange}
              aria-label="Сбросить диапазон годов"
              title="Сбросить диапазон к полному интервалу"
            >
              Сброс
            </button>
          </div>

          <div
            className={`year-filter-range ${
              enabled && !lockedByPropertyFilter ? "" : "year-filter-range--disabled"
            }`}
          >
            <p className="year-filter-range-label">
              Диапазон: <strong>{draftRange.min}</strong> — <strong>{draftRange.max}</strong>
            </p>

            <div
              className="year-filter-dual-slider"
              style={{
                "--range-start": `${getRangeProgress(draftRange.min, minYear, maxYear)}%`,
                "--range-end": `${getRangeProgress(draftRange.max, minYear, maxYear)}%`
              }}
            >
              <input
                type="range"
                min={minYear}
                max={maxYear}
                step={1}
                value={draftRange.min}
                disabled={!enabled || lockedByPropertyFilter}
                className={`year-filter-slider year-filter-slider--start${
                  activeThumb === "start" ? " year-filter-slider--active" : ""
                }`}
                aria-label="Начальный год"
                onChange={handleStartChange}
                onPointerDown={handlePointerDown("start")}
                {...sliderInteractionHandlers}
              />
              <input
                type="range"
                min={minYear}
                max={maxYear}
                step={1}
                value={draftRange.max}
                disabled={!enabled || lockedByPropertyFilter}
                className={`year-filter-slider year-filter-slider--end${
                  activeThumb === "end" ? " year-filter-slider--active" : ""
                }`}
                aria-label="Конечный год"
                onChange={handleEndChange}
                onPointerDown={handlePointerDown("end")}
                {...sliderInteractionHandlers}
              />
            </div>

            <div className="year-filter-bounds">
              <span>{minYear}</span>
              <span>{maxYear}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
