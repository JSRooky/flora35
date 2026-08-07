import React, { useEffect, useRef, useState } from "react";
import { BASEMAP_MODES, BASEMAP_OPTIONS } from "../config/basemapOptions";
import { isYandexMapsApiKeyConfigured } from "./addYandexBasemapLayer";
import { ReactComponent as MapboxIcon } from "../images/map_mb_map_icon.svg";
import { ReactComponent as OsmIcon } from "../images/map_os_map_icon.svg";
import { ReactComponent as YandexIcon } from "../images/map_ya_map_icon.svg";
import "../styles/BasemapPicker.css";

const HOVER_CLOSE_DELAY_MS = 160;

const BASEMAP_ICONS = {
  [BASEMAP_MODES.MAPBOX]: MapboxIcon,
  [BASEMAP_MODES.OSM]: OsmIcon,
  [BASEMAP_MODES.YANDEX]: YandexIcon
};

function BasemapIconGradientDefs() {
  return (
    <svg className="basemap-picker-icon-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="basemap-icon-fill-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#48484a" />
          <stop offset="100%" stopColor="#1d1d1f" />
        </linearGradient>
        <linearGradient id="basemap-icon-mapbox-hover-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#56b4ff" />
          <stop offset="100%" stopColor="#1a4fbf" />
        </linearGradient>
        <linearGradient id="basemap-icon-osm-hover-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#6fcf6a" />
          <stop offset="100%" stopColor="#1f7a3f" />
        </linearGradient>
        <linearGradient id="basemap-icon-yandex-hover-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ff5647" />
          <stop offset="100%" stopColor="#b71c1c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function BasemapModeIcon({ mode }) {
  const Icon = BASEMAP_ICONS[mode];
  if (!Icon) {
    return null;
  }

  return (
    <Icon
      className={`basemap-picker-icon basemap-picker-icon--${mode}`}
      aria-hidden="true"
      focusable="false"
    />
  );
}

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
  const currentBasemapLabel =
    BASEMAP_OPTIONS.find(({ value }) => value === basemapMode)?.label ?? "Mapbox";

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
      <BasemapIconGradientDefs />
      <div className="basemap-picker-toggle-wrap">
        <button
          type="button"
          className={`basemap-picker-toggle${open ? " basemap-picker-toggle--open" : ""}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={currentBasemapLabel}
          title={currentBasemapLabel}
        >
          <BasemapModeIcon mode={basemapMode} />
        </button>
      </div>

      <div
        className={`basemap-picker-panel-wrap${open ? " basemap-picker-panel-wrap--open" : ""}`}
        aria-hidden={!open}
      >
        <div className="basemap-picker-panel" role="listbox" aria-label="Тип карты">
          {alternativeOptions.map(({ value, label }) => {
            const disabled = value === BASEMAP_MODES.YANDEX && !yandexAvailable;
            const optionTitle = disabled
              ? "Задайте REACT_APP_YANDEX_MAPS_API_KEY в .env.local"
              : label;

            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={value === basemapMode}
                aria-label={optionTitle}
                tabIndex={open ? 0 : -1}
                className={`basemap-picker-option${
                  disabled ? " basemap-picker-option--disabled" : ""
                }`}
                title={optionTitle}
                disabled={disabled}
                onClick={() => handleSelect(value)}
              >
                <BasemapModeIcon mode={value} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
