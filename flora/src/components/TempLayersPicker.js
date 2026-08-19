import React, { useEffect, useRef, useState } from "react";
import {
  getTempLayers,
  isRegionTempLayer,
  listTempLayerOriginItems,
  listTempLayerPlaques,
  normalizeTempSource,
  resolveTempSourceMarkerColor,
  TEMP_LAYER_MARKER_PALETTE,
  TEMP_SOURCE_IDS
} from "../tempLayers/tempLayerStore";
import "../styles/ExternalLayersPicker.css";
import "../styles/TempLayersPicker.css";
import {
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  TrashIcon
} from "../images/buttons";
import { ReactComponent as LayersArchiveIcon } from "../images/layers-archive.svg";

const HOVER_CLOSE_DELAY_MS = 160;

function InfoIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="8.2" r="1.15" fill="currentColor" />
      <rect x="11.15" y="10.4" width="1.7" height="6.2" rx="0.7" fill="currentColor" />
    </svg>
  );
}

function HeatmapIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 3.2c.4 2.1-.3 3.6-1.4 5-1.2 1.5-2.6 2.8-2.6 5.1 0 3.1 2.4 5.5 5.4 5.5s5.4-2.4 5.4-5.5c0-2.6-1.5-4.2-2.8-5.8-1-1.2-1.8-2.6-1.5-4.3-.9.6-1.8 1.6-2.5 2.8z"
        opacity="0.92"
      />
    </svg>
  );
}

function formatPlaqueMeta(plaque) {
  if (plaque.layers.some(isRegionTempLayer)) {
    const count = plaque.layers.reduce(
      (sum, layer) => sum + (layer.regionIds?.length || 0),
      0
    ) || plaque.layers.reduce(
      (sum, layer) => sum + (layer.overlays?.find((item) => item.kind === "regions")?.features?.length || 0),
      0
    );
    const points = plaque.layers.reduce(
      (sum, layer) => sum + (layer.features?.length ?? 0),
      0
    );
    const mod10 = count % 10;
    const mod100 = count % 100;
    let regionsText = `${count} субъектов`;
    if (mod10 === 1 && mod100 !== 11) {
      regionsText = `${count} субъект`;
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      regionsText = `${count} субъекта`;
    }
    if (points > 0) {
      return `${regionsText} · ${new Intl.NumberFormat("ru-RU").format(points)} т.`;
    }
    return regionsText;
  }
  const regionIds = new Set();
  let points = 0;
  plaque.layers.forEach((layer) => {
    points += layer.features?.length ?? 0;
    (layer.regionIds || []).forEach((id) => regionIds.add(id));
  });
  const pointsText = new Intl.NumberFormat("ru-RU").format(points);
  const regionCount = regionIds.size;
  const regionPart =
    regionCount === 1 ? "1 рег." : regionCount > 1 ? `${regionCount} рег.` : null;
  return regionPart ? `${regionPart} · ${pointsText} т.` : `${pointsText} т.`;
}

function plaqueRowStyle(plaque) {
  const gbifColor = resolveTempSourceMarkerColor(plaque.markerColor, TEMP_SOURCE_IDS.GBIF);
  const inatColor = resolveTempSourceMarkerColor(plaque.markerColor, TEMP_SOURCE_IDS.INAT);
  const style = {
    "--temp-layer-color-gbif": gbifColor,
    "--temp-layer-color-inat": inatColor
  };
  if (plaque.markerColor) {
    style["--temp-layer-color"] = plaque.markerColor;
  }
  return style;
}

function plaqueOriginItems(plaque) {
  return listTempLayerOriginItems(plaque);
}

function plaqueTitle(plaque) {
  return plaque.taxonName || plaque.label || "Временный слой";
}

function sourceLayer(plaque, sourceId) {
  return plaque.layers.find(
    (layer) => normalizeTempSource(layer.source) === sourceId
  );
}

function LayerColorButton({ plaque, open, tabIndex, onToggle, onSelect, onReset }) {
  const current = plaque.markerColor || "";
  const label = plaqueTitle(plaque);

  return (
    <div className="temp-layers-picker-color">
      <button
        type="button"
        className={`temp-layers-picker-color-btn${
          current ? " temp-layers-picker-color-btn--custom" : ""
        }`}
        tabIndex={tabIndex}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={
          current
            ? `Цвет маркеров «${label}»: ${current}`
            : `Цвет маркеров «${label}»: по царству`
        }
        title={current ? "Цвет маркеров" : "Цвет маркеров (по царству)"}
        style={current ? { backgroundColor: current } : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      />
      {open ? (
        <div
          className="temp-layers-picker-palette"
          role="listbox"
          aria-label={`Палитра цвета для «${label}»`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`temp-layers-picker-palette-swatch temp-layers-picker-palette-swatch--auto${
              !current ? " temp-layers-picker-palette-swatch--selected" : ""
            }`}
            role="option"
            aria-selected={!current}
            title="По умолчанию"
            onClick={() => onReset()}
          >
            По умолчанию
          </button>
          <div className="temp-layers-picker-palette-grid">
            {TEMP_LAYER_MARKER_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`temp-layers-picker-palette-swatch${
                  current === color ? " temp-layers-picker-palette-swatch--selected" : ""
                }`}
                role="option"
                aria-selected={current === color}
                aria-label={color}
                title={color}
                style={{ backgroundColor: color }}
                onClick={() => onSelect(color)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TempLayersPicker({
  dataRevision = 0,
  onToggleLayer,
  onDeleteLayer,
  onArchiveLayer,
  onOpenArchive,
  onColorChange,
  onHeatmapChange,
  onHeatmapAllChange
}) {
  const [open, setOpen] = useState(false);
  const [colorMenuLayerId, setColorMenuLayerId] = useState(null);
  const [infoMenuLayerId, setInfoMenuLayerId] = useState(null);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  void dataRevision;
  const plaques = listTempLayerPlaques();
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

  const isPointerInsidePicker = (event) => {
    const root = rootRef.current;
    if (!root) {
      return false;
    }

    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) {
      return true;
    }

    const x = event.clientX;
    const y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }

    const wrap = root.querySelector(".external-layers-picker-panel-wrap");
    return [root, wrap].some((node) => {
      if (!node) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  };

  const handleClose = (event) => {
    if (event && isPointerInsidePicker(event)) {
      return;
    }

    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setColorMenuLayerId(null);
      setInfoMenuLayerId(null);
    }, HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (colorMenuLayerId) {
          setColorMenuLayerId(null);
          return;
        }
        if (infoMenuLayerId) {
          setInfoMenuLayerId(null);
          return;
        }
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, colorMenuLayerId, infoMenuLayerId]);

  useEffect(() => () => clearCloseTimer(), []);

  const activeCount = plaques.filter((plaque) =>
    plaque.layers.some((layer) => layer.visible)
  ).length;
  const heatmapCount = layers.filter((layer) => layer.heatmapEnabled).length;
  const allHeatmapsOn = layers.length > 0 && heatmapCount === layers.length;

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
          setColorMenuLayerId(null);
          setInfoMenuLayerId(null);
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
          className={`external-layers-picker-panel temp-layers-picker-panel${
            colorMenuLayerId || infoMenuLayerId
              ? " temp-layers-picker-panel--palette-open"
              : ""
          }`}
          role="listbox"
          aria-label="Временные слои"
          aria-multiselectable="true"
        >
          {layers.length === 0 ? (
            <>
              <div className="temp-layers-picker-toolbar">
                <button
                  type="button"
                  className="temp-layers-picker-archive-open"
                  tabIndex={open ? 0 : -1}
                  onClick={() => onOpenArchive?.()}
                >
                  <LayersIcon className="temp-layers-picker-heatmap-icon" />
                  <span>Архив</span>
                </button>
              </div>
              <p className="temp-layers-picker-empty">
                Пока нет временных слоёв. Сохраните выборку из фильтров карты или кнопкой «Во временный слой».
              </p>
            </>
          ) : (
            <>
              <div className="temp-layers-picker-toolbar">
                <button
                  type="button"
                  className="temp-layers-picker-archive-open"
                  tabIndex={open ? 0 : -1}
                  onClick={() => onOpenArchive?.()}
                >
                  <LayersIcon className="temp-layers-picker-heatmap-icon" />
                  <span>Архив</span>
                </button>
                <button
                  type="button"
                  className={`temp-layers-picker-heatmap-all${
                    allHeatmapsOn ? " temp-layers-picker-heatmap-all--on" : ""
                  }`}
                  tabIndex={open ? 0 : -1}
                  aria-pressed={allHeatmapsOn}
                  onClick={() => onHeatmapAllChange?.(!allHeatmapsOn)}
                >
                  <HeatmapIcon className="temp-layers-picker-heatmap-icon" />
                  <span>
                    {allHeatmapsOn
                      ? "Тепловые карты выкл."
                      : "Тепловая карта всех слоёв"}
                  </span>
                </button>
              </div>
              {plaques.map((plaque) => {
              const primary = plaque.layers[0];
              const gbif = sourceLayer(plaque, TEMP_SOURCE_IDS.GBIF);
              const inat = sourceLayer(plaque, TEMP_SOURCE_IDS.INAT);
              const mapSource = sourceLayer(plaque, TEMP_SOURCE_IDS.MAP);
              const anyVisible = plaque.layers.some((layer) => layer.visible);
              const heatmapOn = plaque.layers.some((layer) => layer.heatmapEnabled);
              const isRegionsPlaque = plaque.layers.some(isRegionTempLayer);
              const splitStripe = Boolean(gbif && inat);
              const title = plaqueTitle(plaque);
              const originItems = plaqueOriginItems(plaque);
              const infoOpen = infoMenuLayerId === primary.id;

              return (
              <div
                key={plaque.key}
                className={`temp-layers-picker-row${
                  anyVisible ? "" : " temp-layers-picker-row--hidden"
                }${
                  splitStripe ? " temp-layers-picker-row--split" : ""
                }${
                  !splitStripe && gbif ? " temp-layers-picker-row--gbif" : ""
                }${
                  !splitStripe && inat ? " temp-layers-picker-row--inat" : ""
                }${
                  colorMenuLayerId === primary.id || infoOpen
                    ? " temp-layers-picker-row--palette-open"
                    : ""
                }`}
                style={plaqueRowStyle(plaque)}
              >
                <div className="temp-layers-picker-main">
                <button
                  type="button"
                  role="option"
                  aria-selected={anyVisible}
                  tabIndex={open ? 0 : -1}
                  className="temp-layers-picker-toggle"
                  title={anyVisible ? `Скрыть «${title}»` : `Показать «${title}»`}
                  onClick={() => {
                    plaque.layers.forEach((layer) => {
                      onToggleLayer?.(layer.id, !anyVisible);
                    });
                  }}
                >
                  <span className="external-layers-picker-option-label">{title}</span>
                </button>
                <div className="temp-layers-picker-option-meta-row">
                  <span className="temp-layers-picker-option-meta">{formatPlaqueMeta(plaque)}</span>
                  {isRegionsPlaque ? null : (
                  <span className="temp-layers-picker-sources" role="group" aria-label="Источники">
                  <button
                    type="button"
                    className={`temp-layers-picker-source temp-layers-picker-source--gbif${
                      gbif?.visible ? " temp-layers-picker-source--on" : ""
                    }`}
                    tabIndex={open && gbif ? 0 : -1}
                    disabled={!gbif}
                    aria-pressed={Boolean(gbif?.visible)}
                    title={gbif ? "GBIF" : "GBIF не загружен"}
                    onClick={() => {
                      if (gbif) {
                        onToggleLayer?.(gbif.id, !gbif.visible);
                      }
                    }}
                  >
                    GBIF
                  </button>
                  <button
                    type="button"
                    className={`temp-layers-picker-source temp-layers-picker-source--inat${
                      inat?.visible ? " temp-layers-picker-source--on" : ""
                    }`}
                    tabIndex={open && inat ? 0 : -1}
                    disabled={!inat}
                    aria-pressed={Boolean(inat?.visible)}
                    title={inat ? "iNaturalist" : "iNaturalist не загружен"}
                    onClick={() => {
                      if (inat) {
                        onToggleLayer?.(inat.id, !inat.visible);
                      }
                    }}
                  >
                    iNat
                  </button>
                  {mapSource ? (
                    <button
                      type="button"
                      className={`temp-layers-picker-source temp-layers-picker-source--map${
                        mapSource.visible ? " temp-layers-picker-source--on" : ""
                      }`}
                      tabIndex={open ? 0 : -1}
                      aria-pressed={Boolean(mapSource.visible)}
                      title="Локальные и прочие точки карты"
                      onClick={() => onToggleLayer?.(mapSource.id, !mapSource.visible)}
                    >
                      Карта
                    </button>
                  ) : null}
                </span>
                  )}
                </div>
                </div>
                <button
                  type="button"
                  className={`temp-layers-picker-info${infoOpen ? " temp-layers-picker-info--on" : ""}`}
                  tabIndex={open ? 0 : -1}
                  aria-expanded={infoOpen}
                  aria-label={`Информация о слое «${title}»`}
                  title="Информация о слое"
                  onClick={(event) => {
                    event.stopPropagation();
                    setColorMenuLayerId(null);
                    setInfoMenuLayerId((current) =>
                      current === primary.id ? null : primary.id
                    );
                  }}
                >
                  <InfoIcon className="temp-layers-picker-info-icon" />
                </button>
                {infoOpen ? (
                  <div
                    className="temp-layers-picker-info-popup"
                    role="dialog"
                    aria-label={`Фильтры слоя «${title}»`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="temp-layers-picker-info-title">
                      {plaque.filterSnapshot?.length || plaque.overlays?.length
                        ? "Применённые фильтры"
                        : "Условия выборки"}
                    </p>
                    {originItems.length > 0 ? (
                      <ul className="temp-layers-picker-info-list">
                        {originItems.map((item, index) => (
                          <li key={`${item.label}-${index}`}>
                            {item.label}
                            {item.details?.length ? (
                              <ul className="temp-layers-picker-info-details">
                                {item.details.map((detail, detailIndex) => (
                                  <li key={`${item.label}-${detail}-${detailIndex}`}>
                                    {detail}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="temp-layers-picker-info-empty">Нет сохранённых условий.</p>
                    )}
                  </div>
                ) : null}
                {isRegionsPlaque &&
                !plaque.layers.some((layer) => (layer.features?.length ?? 0) > 0) ? null : (
                <button
                  type="button"
                  className={`temp-layers-picker-heatmap${
                    heatmapOn ? " temp-layers-picker-heatmap--on" : ""
                  }`}
                  tabIndex={open ? 0 : -1}
                  aria-pressed={heatmapOn}
                  aria-label={
                    heatmapOn
                      ? `Выключить тепловую карту «${title}»`
                      : `Тепловая карта слоя «${title}»`
                  }
                  title={
                    heatmapOn
                      ? "Тепловая карта слоя включена"
                      : "Тепловая карта только этого слоя"
                  }
                  onClick={() => onHeatmapChange?.(primary.id, !heatmapOn)}
                >
                  <HeatmapIcon className="temp-layers-picker-heatmap-icon" />
                </button>
                )}
                <button
                  type="button"
                  className="temp-layers-picker-delete"
                  tabIndex={open ? 0 : -1}
                  aria-label={`В архив «${title}»`}
                  title="В архив"
                  onClick={() => onArchiveLayer?.(primary.id)}
                >
                  <LayersArchiveIcon className="temp-layers-picker-delete-icon" aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className="temp-layers-picker-delete"
                  tabIndex={open ? 0 : -1}
                  aria-label={`Удалить слой «${title}»`}
                  title="Удалить навсегда"
                  onClick={() => onDeleteLayer?.(primary.id)}
                >
                  <TrashIcon className="temp-layers-picker-delete-icon" aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className={`temp-layers-picker-hide${
                    anyVisible ? "" : " temp-layers-picker-hide--off"
                  }`}
                  tabIndex={open ? 0 : -1}
                  aria-pressed={!anyVisible}
                  aria-label={
                    anyVisible ? `Скрыть «${title}»` : `Показать «${title}»`
                  }
                  title={anyVisible ? "Скрыть слой" : "Показать слой"}
                  onClick={() => {
                    plaque.layers.forEach((layer) => {
                      onToggleLayer?.(layer.id, !anyVisible);
                    });
                  }}
                >
                  {anyVisible ? (
                    <EyeIcon className="temp-layers-picker-hide-icon" aria-hidden="true" focusable="false" />
                  ) : (
                    <EyeOffIcon className="temp-layers-picker-hide-icon" aria-hidden="true" focusable="false" />
                  )}
                </button>
                <LayerColorButton
                  plaque={plaque}
                  open={colorMenuLayerId === primary.id}
                  tabIndex={open ? 0 : -1}
                  onToggle={() => {
                    setInfoMenuLayerId(null);
                    setColorMenuLayerId((current) =>
                      current === primary.id ? null : primary.id
                    );
                  }}
                  onSelect={(color) => {
                    onColorChange?.(primary.id, color);
                    setColorMenuLayerId(null);
                  }}
                  onReset={() => {
                    onColorChange?.(primary.id, null);
                    setColorMenuLayerId(null);
                  }}
                />
              </div>
              );
            })}
            </>
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
          <ClockIcon className="external-layers-picker-icon" aria-hidden="true" focusable="false" />
          {activeCount > 0 ? (
            <span className="external-layers-picker-count">{activeCount}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
