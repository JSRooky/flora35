import React, { useEffect, useRef, useState } from "react";
import { hasGbifDataset } from "../gbif/gbifStore";
import { hasInatDataset } from "../inaturalist/inatStore";
import "../styles/ExternalLayersPicker.css";

export const EXTERNAL_LAYER_IDS = {
  GBIF: "gbif",
  INATURALIST: "inaturalist"
};

export const EXTERNAL_LAYER_OPTIONS = [
  {
    id: EXTERNAL_LAYER_IDS.GBIF,
    label: "GBIF",
    shortLabel: "G"
  },
  {
    id: EXTERNAL_LAYER_IDS.INATURALIST,
    label: "iNaturalist",
    shortLabel: "iN"
  }
];

const HOVER_CLOSE_DELAY_MS = 160;

function LayersIcon() {
  return (
    <svg
      className="external-layers-picker-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.2 12 16.7 20.5 12.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 16.4 12 20.9 20.5 16.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Выбор слоёв внешних баз (GBIF / iNaturalist) в режиме «Внешние источники».
 * Стиль как у BasemapPicker; раскрывается вверх (виджет внизу слева).
 */
export default function ExternalLayersPicker({
  visible = false,
  enabledLayers = {
    [EXTERNAL_LAYER_IDS.GBIF]: true,
    [EXTERNAL_LAYER_IDS.INATURALIST]: true
  },
  dataRevision = 0,
  onToggleLayer,
  onRequestLoad
}) {
  const [open, setOpen] = useState(false);
  const [confirmSource, setConfirmSource] = useState(null);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);

  const gbifLoaded = hasGbifDataset();
  const inatLoaded = hasInatDataset();
  // dataRevision — чтобы пересчитать loaded после загрузки.
  void dataRevision;

  const loadedById = {
    [EXTERNAL_LAYER_IDS.GBIF]: gbifLoaded,
    [EXTERNAL_LAYER_IDS.INATURALIST]: inatLoaded
  };

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
    if (confirmSource) {
      return;
    }
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!visible) {
      setOpen(false);
      setConfirmSource(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (confirmSource) {
          setConfirmSource(null);
        } else {
          setOpen(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, confirmSource]);

  useEffect(() => () => clearCloseTimer(), []);

  if (!visible) {
    return null;
  }

  const handleOptionClick = (option) => {
    const loaded = loadedById[option.id];
    if (!loaded) {
      setConfirmSource(option);
      return;
    }

    onToggleLayer?.(option.id, !enabledLayers[option.id]);
  };

  const handleConfirmLoad = () => {
    const source = confirmSource;
    setConfirmSource(null);
    setOpen(false);
    if (source) {
      onRequestLoad?.(source.id);
    }
  };

  const handleDeclineLoad = () => {
    setConfirmSource(null);
  };

  const activeCount = EXTERNAL_LAYER_OPTIONS.filter(
    (option) => loadedById[option.id] && enabledLayers[option.id]
  ).length;

  return (
    <div
      className="external-layers-picker"
      ref={rootRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={(event) => {
        if (confirmSource) {
          return;
        }
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
          aria-label="Слои внешних источников"
          aria-multiselectable="true"
        >
          {EXTERNAL_LAYER_OPTIONS.map((option) => {
            const loaded = loadedById[option.id];
            const enabled = Boolean(enabledLayers[option.id]);
            const selected = loaded && enabled;
            const title = loaded
              ? selected
                ? `Скрыть слой ${option.label}`
                : `Показать слой ${option.label}`
              : `${option.label}: данные не загружены`;

            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-checked={selected}
                tabIndex={open ? 0 : -1}
                className={`external-layers-picker-option${
                  selected ? " external-layers-picker-option--selected" : ""
                }${!loaded ? " external-layers-picker-option--empty" : ""}`}
                title={title}
                onClick={() => handleOptionClick(option)}
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
                <span className="external-layers-picker-option-label">{option.label}</span>
                {!loaded ? (
                  <span className="external-layers-picker-option-badge">нет данных</span>
                ) : null}
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
          }`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Слои внешних источников"
          title="Слои внешних источников"
        >
          <LayersIcon />
          {activeCount > 0 ? (
            <span className="external-layers-picker-count">{activeCount}</span>
          ) : null}
        </button>
      </div>

      {confirmSource ? (
        <div
          className="external-layers-confirm-overlay"
          onClick={handleDeclineLoad}
          onMouseEnter={clearCloseTimer}
        >
          <div
            className="external-layers-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="external-layers-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="external-layers-confirm-title" className="external-layers-confirm-title">
              Загрузить {confirmSource.label}?
            </h4>
            <p className="external-layers-confirm-text">
              Данные {confirmSource.label} ещё не загружены. Открыть панель «Источники данных»
              для загрузки?
            </p>
            <div className="external-layers-confirm-actions">
              <button
                type="button"
                className="external-layers-confirm-btn external-layers-confirm-btn--secondary"
                onClick={handleDeclineLoad}
              >
                Отказаться
              </button>
              <button
                type="button"
                className="external-layers-confirm-btn"
                onClick={handleConfirmLoad}
              >
                Загрузить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
