import React, { useEffect, useRef, useState } from "react";
import { BASEMAP_MODES, BASEMAP_OPTIONS } from "../config/basemapOptions";
import { isYandexMapsApiKeyConfigured } from "./addYandexBasemapLayer";
import "../styles/BasemapPicker.css";

const HOVER_CLOSE_DELAY_MS = 160;

/** Выбор подложки карты: квадратная кнопка и список альтернативных карт по наведению. */
export default function BasemapPicker({ basemapMode = BASEMAP_MODES.MAPBOX, onBasemapModeChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  const yandexAvailable = isYandexMapsApiKeyConfigured();

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

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  const handleSelect = (mode) => {
    if (mode === BASEMAP_MODES.YANDEX && !yandexAvailable) {
      return;
    }

    onBasemapModeChange?.(mode);
    setOpen(false);
  };

  const alternativeOptions = BASEMAP_OPTIONS.filter(({ value }) => value !== basemapMode);

  return (
    <div
      className="basemap-picker"
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
      <div className="basemap-picker-toggle-wrap">
        <button
          type="button"
          className={`basemap-picker-toggle${open ? " basemap-picker-toggle--open" : ""}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Сменить подложку карты"
          title="Сменить подложку карты"
        >
          <span
            className={`basemap-picker-preview basemap-picker-preview--${basemapMode}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        className={`basemap-picker-panel-wrap${open ? " basemap-picker-panel-wrap--open" : ""}`}
        aria-hidden={!open}
      >
        <div className="basemap-picker-panel" role="listbox" aria-label="Тип карты">
          {alternativeOptions.map(({ value, title }) => {
            const disabled = value === BASEMAP_MODES.YANDEX && !yandexAvailable;
            const optionTitle = disabled
              ? "Задайте REACT_APP_YANDEX_MAPS_API_KEY в .env.local"
              : title;

            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-label={optionTitle}
                tabIndex={open ? 0 : -1}
                className={`basemap-picker-option${
                  disabled ? " basemap-picker-option--disabled" : ""
                }`}
                title={optionTitle}
                disabled={disabled}
                onClick={() => handleSelect(value)}
              >
                <span
                  className={`basemap-picker-preview basemap-picker-preview--${value}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
