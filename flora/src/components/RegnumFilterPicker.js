import React, { useEffect, useRef, useState } from "react";
import {
  REGNUM_FILTER_OPTIONS
} from "./RegnumFilterPanel";
import { getPointColorForRegnum } from "./pointColors";
import "../styles/ExternalLayersPicker.css";
import "../styles/RegnumFilterPicker.css";

const HOVER_CLOSE_DELAY_MS = 160;

function RegnumIcon() {
  return (
    <svg
      className="external-layers-picker-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="14" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/**
 * Фильтр точек по царству — виджет внизу слева рядом со «Слои внешних источников».
 * Без отметок показываются все царства.
 */
export default function RegnumFilterPicker({
  activeRegnumFilters = [],
  onRegnumFilterChange
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleOpen = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const handleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  const activeCount = activeRegnumFilters.length;
  const isFiltered = activeCount > 0;

  return (
    <div
      className="external-layers-picker regnum-filter-picker"
      ref={rootRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <div
        className={`external-layers-picker-panel-wrap${
          open ? " external-layers-picker-panel-wrap--open" : ""
        }`}
        aria-hidden={!open}
      >
        <div
          className="external-layers-picker-panel"
          role="listbox"
          aria-label="Царство"
          aria-multiselectable="true"
        >
          <p className="regnum-filter-picker-hint">
            Без отметок — все точки. Отметьте одно или несколько царств.
          </p>
          {REGNUM_FILTER_OPTIONS.map(({ code, label }, index) => {
            const selected = activeRegnumFilters.includes(code);
            const color = getPointColorForRegnum(code || null);

            return (
              <button
                key={code || "__none__"}
                type="button"
                role="option"
                aria-selected={selected}
                aria-checked={selected}
                tabIndex={open ? 0 : -1}
                className={`external-layers-picker-option${
                  selected ? " external-layers-picker-option--selected" : ""
                }`}
                style={{ transitionDelay: open ? `${0.04 + index * 0.04}s` : undefined }}
                title={selected ? `Скрыть: ${label}` : `Показать только с «${label}»`}
                onClick={() => onRegnumFilterChange?.(code, !selected)}
              >
                <span
                  className={`external-layers-picker-check${
                    selected ? " external-layers-picker-check--checked" : ""
                  }`}
                  aria-hidden="true"
                >
                  {selected ? (
                    <svg viewBox="0 0 16 16" className="external-layers-picker-check-icon">
                      <path
                        d="M3.5 8.2 6.4 11.1 12.5 4.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span
                  className="regnum-filter-picker-swatch"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="external-layers-picker-option-label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="external-layers-picker-toggle-wrap">
        <button
          type="button"
          className={`external-layers-picker-toggle${
            open ? " external-layers-picker-toggle--open" : ""
          }${isFiltered ? " regnum-filter-picker-toggle--active" : ""}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Царство"
          title={
            isFiltered
              ? REGNUM_FILTER_OPTIONS.filter(({ code }) =>
                  activeRegnumFilters.includes(code)
                )
                  .map(({ label }) => label)
                  .join(", ")
              : "Царство: все"
          }
        >
          <RegnumIcon />
          {isFiltered ? (
            <span className="external-layers-picker-count">{activeCount}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
