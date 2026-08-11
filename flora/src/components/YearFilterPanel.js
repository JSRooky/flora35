import React, { useEffect, useRef, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/YearFilterPanel.css";

function getRangeProgress(value, min, max) {
  if (max <= min) {
    return 0;
  }

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

function rangesEqual(a, b) {
  return a?.min === b?.min && a?.max === b?.max;
}

/** Панель фильтра точек по диапазону годов с двойным ползунком. */
export default function YearFilterPanel({
  enabled = false,
  onEnabledChange,
  yearBounds,
  range,
  onRangeChange,
  lockedByPropertyFilter = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const [draftRange, setDraftRange] = useState(range);
  const [activeThumb, setActiveThumb] = useState(null);
  const draftRangeRef = useRef(draftRange);
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## year в docs/moduleHelp.md
  const { min: minYear, max: maxYear } = yearBounds;

  useEffect(() => {
    setDraftRange((prev) => (rangesEqual(prev, range) ? prev : range));
  }, [range]);

  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

  const emitRange = (next) => {
    draftRangeRef.current = next;
    setDraftRange(next);
    onRangeChange?.(next);
  };

  const handleStartChange = (event) => {
    const nextMin = Number(event.target.value);
    const { max } = draftRangeRef.current;
    emitRange({
      min: Math.min(nextMin, max),
      max
    });
  };

  const handleEndChange = (event) => {
    const nextMax = Number(event.target.value);
    const { min } = draftRangeRef.current;
    emitRange({
      min,
      max: Math.max(nextMax, min)
    });
  };

  const clearActiveThumb = () => {
    setActiveThumb(null);
  };

  const handlePointerDown = (thumb) => () => {
    setActiveThumb(thumb);
  };

  const isFullRange = draftRange.min === minYear && draftRange.max === maxYear;

  const handleResetRange = () => {
    const fullRange = { min: minYear, max: maxYear };
    emitRange(fullRange);
    setActiveThumb(null);
  };

  return (
    <aside className={`year-filter-panel ${collapsed ? "year-filter-panel--collapsed" : ""}`}>
      <div className="year-filter-panel-header">
        <h3 className="year-filter-panel-title">Год находки</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
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
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
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
                onPointerUp={clearActiveThumb}
                onPointerCancel={clearActiveThumb}
                onBlur={clearActiveThumb}
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
                onPointerUp={clearActiveThumb}
                onPointerCancel={clearActiveThumb}
                onBlur={clearActiveThumb}
              />
            </div>

            <div className="year-filter-bounds">
              <span>{minYear}</span>
              <span>{maxYear}</span>
            </div>
          </div>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.YEAR} open={helpOpen} />
    </aside>
  );
}
