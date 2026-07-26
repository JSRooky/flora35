import React, { useEffect, useRef, useState } from "react";
import { getYearBounds } from "./yearBounds";
import "../styles/YearFilterPanel.css";

const YEAR_BOUNDS = getYearBounds();

function getRangeProgress(value, min, max) {
  return ((value - min) / (max - min)) * 100;
}

function getCollapsedSummary(enabled, range) {
  if (!enabled) {
    return "Фильтр выключен";
  }

  return `${range.min} — ${range.max}`;
}

export default function YearFilterPanel({
  enabled = false,
  onEnabledChange,
  range = YEAR_BOUNDS,
  onRangeChange
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draftRange, setDraftRange] = useState(range);
  const [activeThumb, setActiveThumb] = useState(null);
  const draftRangeRef = useRef(draftRange);
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const { min: minYear, max: maxYear } = YEAR_BOUNDS;

  useEffect(() => {
    setDraftRange(range);
  }, [range]);

  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

  const commitRange = () => {
    onRangeChange?.({ ...draftRangeRef.current });
    setActiveThumb(null);
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

  const sliderCommitHandlers = {
    onMouseUp: commitRange,
    onTouchEnd: commitRange,
    onPointerUp: commitRange,
    onKeyUp: commitRange,
    onBlur: commitRange
  };

  return (
    <aside className={`year-filter-panel ${collapsed ? "year-filter-panel--collapsed" : ""}`}>
      <div className="year-filter-panel-header">
        <h3 className="year-filter-panel-title">Год находки</h3>
        <button
          type="button"
          className="year-filter-panel-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {collapsed ? (
        <p className="year-filter-panel-summary">
          {getCollapsedSummary(enabled, range)}
        </p>
      ) : (
        <div className="year-filter-panel-content">
          <label className="year-filter-switch" title="Показывать только точки в выбранном диапазоне лет">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onEnabledChange?.(e.target.checked)}
            />
            <span className="year-filter-switch-slider" />
            <span className="year-filter-switch-label">Фильтровать по годам</span>
          </label>

          <div className={`year-filter-range ${enabled ? "" : "year-filter-range--disabled"}`}>
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
                disabled={!enabled}
                className={`year-filter-slider year-filter-slider--start${
                  activeThumb === "start" ? " year-filter-slider--active" : ""
                }`}
                aria-label="Начальный год"
                onChange={handleStartChange}
                onPointerDown={() => setActiveThumb("start")}
                {...sliderCommitHandlers}
              />
              <input
                type="range"
                min={minYear}
                max={maxYear}
                step={1}
                value={draftRange.max}
                disabled={!enabled}
                className={`year-filter-slider year-filter-slider--end${
                  activeThumb === "end" ? " year-filter-slider--active" : ""
                }`}
                aria-label="Конечный год"
                onChange={handleEndChange}
                onPointerDown={() => setActiveThumb("end")}
                {...sliderCommitHandlers}
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
