import React, { useEffect, useRef, useState } from "react";
import { getTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/ExternalLayersPicker.css";
import "../styles/TempLayersPicker.css";

const HOVER_CLOSE_DELAY_MS = 160;

function ClockLayersIcon() {
  return (
    <svg
      className="external-layers-picker-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 8.2v4.1l2.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TempLayersPicker({
  dataRevision = 0,
  onToggleLayer,
  onDeleteLayer
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  void dataRevision;
  const layers = getTempLayers();

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

  const activeCount = layers.filter((layer) => layer.visible).length;

  return (
    <div
      className="external-layers-picker temp-layers-picker"
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
          className="external-layers-picker-panel temp-layers-picker-panel"
          role="listbox"
          aria-label="Временные слои"
          aria-multiselectable="true"
        >
          {layers.length === 0 ? (
            <p className="temp-layers-picker-empty">
              Пока нет временных слоёв. Сохраните выборку кнопкой «Во временный слой».
            </p>
          ) : (
            layers.map((layer) => (
              <div
                key={layer.id}
                className={`temp-layers-picker-row${
                  layer.visible ? " temp-layers-picker-row--selected" : ""
                }`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={layer.visible}
                  tabIndex={open ? 0 : -1}
                  className="temp-layers-picker-toggle"
                  title={layer.visible ? `Скрыть «${layer.label}»` : `Показать «${layer.label}»`}
                  onClick={() => onToggleLayer?.(layer.id, !layer.visible)}
                >
                  <span
                    className={`external-layers-picker-check${
                      layer.visible ? " external-layers-picker-check--checked" : ""
                    }`}
                    aria-hidden="true"
                  >
                    {layer.visible ? (
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
                  <span className="temp-layers-picker-option-text">
                    <span className="external-layers-picker-option-label">{layer.label}</span>
                    <span className="temp-layers-picker-option-meta">
                      {new Intl.NumberFormat("ru-RU").format(layer.features?.length ?? 0)} т.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="temp-layers-picker-delete"
                  tabIndex={open ? 0 : -1}
                  aria-label={`Удалить слой «${layer.label}»`}
                  title="Удалить"
                  onClick={() => onDeleteLayer?.(layer.id)}
                >
                  Удалить
                </button>
              </div>
            ))
          )}
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
          aria-label="Временные слои"
          title="Временные слои"
        >
          <ClockLayersIcon />
          {activeCount > 0 ? (
            <span className="external-layers-picker-count">{activeCount}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
